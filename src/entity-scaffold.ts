import * as fs from 'fs/promises';
import { allEntityTypes, allStartEnds, valueTypes, Generator, Entity, EntityType, Op, ProcessingConfig, ProcessingCtx, Prop, startGen, defaultEntityType } from "./types";


const defaultMaxPass=10000;

const AliasMap:{[key:string]:string}={
    '@startSource':'@start @source',
    '@endSource':'@end source',
    '@startPublic':'@start @source public',
    '@endPublic':'@end public',
    '@public':'@source public',
    '@basic':'@source basic',
    '@uuid':'@default newUid()',
    '@autoId':'@public @basic @uuid'
}

export function unAlias(value:string){
    let prev:string;
    let count=0;
    do{
        prev=value;
        for(const e in AliasMap){
            value=value.split(e).join(AliasMap[e]);
        }
        count++;
        if(count>100){
            throw new Error('Max alias depth reached. Their is likely a recursive alias definition');
        }
    }while(prev!==value)
    return value;
}

export function toEntityType(type:string):EntityType{
    if(!allEntityTypes.includes(type as any)){
        throw new Error(type+' is not an EntityType');
    }
    return type as any;
}

export function firstToLower(value:string){
    if(!value){
        return '';
    }
    return value[0].toLowerCase()+value.substr(1);
}

function splitAtString(str:string):string[]{
    const parts=str.split('@').map(s=>'@'+s.trim());
    if(parts[0]==='@'){
        parts.shift();
    }else{
        parts[0]=parts[0].substr(1);
    }
    return parts;
}

export function createGenerator(config:ProcessingConfig, name:string, args:string[])
{
    const factory=config.generatorFactories[name];
    if(!factory){
        throw new Error('No generator factory found by name - '+name);
    }
    return factory(name,args);
}

export function parseEntityString(ctx:ProcessingCtx, eStr:string):Entity
{
    const atts=eStr.split('@').map(a=>a.trim());
    const [name,_type]=atts[0].split(':').map(s=>s.trim());
    const type:EntityType=toEntityType(_type||defaultEntityType);
    atts.shift();
    
    return {
        name,
        type,
        isTemplate:atts.includes('tmpl'),
        documentPath:null,
        opDepsResolved:false,
        resolved:false,
        props:[],
        ops:[],
    }
}

export function parseOpString(ctx:ProcessingCtx, opStr:string, entityType:EntityType):Op|null
{
    opStr=opStr?.trim();
    if(!opStr){
        return null;
    }

    if(opStr.startsWith('/')){
        opStr='@docPath '+opStr;
    }

    let comment:string|null=null;
    const ci=opStr.indexOf('#');
    if(ci!==-1){
        comment=opStr.substr(ci+1).trim();
        opStr=opStr.substr(0,ci).trim();
        if(!opStr){
            return null;
        }
    }

    opStr=unAlias(opStr);

    let parts=splitAtString(opStr);
    if(parts[0][0]==='@'){
        return parseOpAry(ctx,parts);
    }else{
        const prop=parsePropAry(ctx,parts,entityType);
        prop.comment=comment;
        return {prop}
        
    }
}

export function parsePropAry(ctx:ProcessingCtx, parts:string[], entityType:EntityType):Prop
{
    if(!parts?.length){
        throw new Error('Empty Prop array');
    }

    const i=parts[0].indexOf(':');
    let name=i===-1?parts[0].trim():parts[0].substr(0,i).trim();
    let type=i===-1?'':parts[0].substr(i+1).trim();
    if(entityType==='union' && !type){
        type='string';
    }
    const typeParts=entityType==='typeDef' && name==='type'?[type]:type.split(':').map(t=>t.trim());
    if(entityType!=='typeDef'){
        type=typeParts[0];
    }
    if(!type){
        throw new Error('property type expected. Property - '+name);
    }
    
    let isPointer, isQueryPointer;
    if(type.startsWith('**')){
        isQueryPointer=true;
        isPointer=false;
    }else if(type.startsWith('*')){
        isQueryPointer=false;
        isPointer=true;
    }else{
        isQueryPointer=false;
        isPointer=false;
    }

    const isCollection=type.includes('[');
    const isNullable=type.includes('?');

    if(entityType==='interface'){
        type=type
            .split('*').join('')
            .split(' ').join('')
            .split('?').join('')
            .split('[').join('')
            .split(']').join('');
    }

    const isValueType=valueTypes.includes(type as any);

    parts=[...parts];
    parts.shift();
    return {
        name,
        comment:null,
        isId:false,
        isInheritedId:false,
        type:isValueType?type as any:'other',
        typeName:type,
        isNullable,
        required:false,
        copySource:null,
        isValueType,
        isQueryPointer,
        isPointer,
        isCollection,
        resolved:false,
        prefix:null,
        defaultValue:null,
        sources:[],
        attAry:[],
        atts:{},
        generators:parseGenerators(ctx,parts)
    }
}

export function parseOpAry(ctx:ProcessingCtx, parts:string[]):Op
{
    if(!parts?.length){
        throw new Error('Empty Op array');
    }

    
    parts=[...parts];
    const se=parts[0];

    return {
        startEnd:allStartEnds.includes(se as any)?se as any:undefined,
        generators:parseGenerators(ctx,parts)
    }
}

export function parseGenerator(ctx:ProcessingCtx, str:string):Generator
{
    str=unAlias(str);
    let parts=str.split(' ');
    const name=parts[0];
    parts.shift();
    return createGenerator(ctx,name,parts);
}

export function parseGenerators(ctx:ProcessingCtx, parts:string[]):Generator[]
{
    return parts.map(g=>parseGenerator(ctx,g));
}

export function addEntityProp(ctx:ProcessingCtx, entity:Entity, prop:Prop)
{
    if(entity.props.find(p=>p.name===prop?.name)){
        throw new Error('Duplicate prop:'+prop.name+', entity:'+entity.name)
    }
    entity.props.push(prop);
    for(const sOp of ctx.genStack){
        const clone=createGenerator(ctx,sOp.name,sOp.args);
        prop.generators.push(clone);
        prop.resolved=false;
    }
}

async function resolveEntityAsync(ctx:ProcessingCtx, entity:Entity)
{

    if(!entity.ops.length){
        entity.resolved=true;
    }

    if(entity.resolved){
        return;
    }

    ctx.currentEntity=entity;
    ctx.currentProp=null;

    if(!entity.opDepsResolved){
        if( !entity.ops
                .every(o=>!o.generators?.length || o.generators
                    .every(g=>g.getDeps(ctx).every(e=>e.resolved))))
        {
            return;
        }

        for(const op of entity.ops){
            if(op.prop){
                addEntityProp(ctx,entity,op.prop);
            }else if(op.generators){
                for(const gen of op.generators){
                    await gen.executeAsync(ctx,null,op);
                    if(gen.name===startGen){
                        break;
                    }
                }
            }
        }

        entity.opDepsResolved=true;

        // reset opStack
        ctx.genStack=[];
    }


    for(const prop of entity.props){
        
        if(prop.resolved){
            continue;
        }

        ctx.currentProp=prop;
        for(const gen of prop.generators){
            if(!gen.resolved && gen.getDeps(ctx).every(d=>d.resolved)){
                await gen.executeAsync(ctx,prop,null);
            }
        }
        prop.resolved=prop.generators.every(g=>g.resolved);

    }


    entity.resolved=entity.props.every(p=>p.resolved);

    if(entity.resolved){

        if(!entity.props.some(p=>p.isId)){
            const idName=entity.name[0].toLowerCase()+entity.name.substr(1)+'Id';
            const idNoPublicName=idName.split('Public').join('')
            const idProp=entity.props.find(p=>p.name===idName || p.name===idNoPublicName || p.name==='id');
            if(idProp){
                idProp.isId=true;
            }
        }

        for(const prop of entity.props){
            for(const att of prop.attAry){
                prop.atts[att.name]=att.value;
            }
        }
    }
}

async function resolveCtxAsync(ctx:ProcessingCtx)
{
    while(true){
        for(const e of ctx.entities){
            await resolveEntityAsync(ctx,e);
        }
        ctx.pass++;
        if(ctx.entities.every(e=>e.resolved)){
            break;
        }
        if(ctx.pass>ctx.maxPasses){
            await fs.writeFile('../entities-err.json',JSON.stringify(ctx,undefined,4))
            throw new Error(
                'Max resolve passes reached. '+
                'There is most likely a copy loop in the provided model. '+
                'maxPasses='+ctx.maxPasses);
        }
    }

    // Update isValueType of union, enum and typeDefs
    for(const e of ctx.entities){
        for(const prop of e.props){
            if(prop.isValueType){
                continue;
            }
            const ep=ctx.entities.find(et=>et.name===prop.typeName);
            if(!ep){
                continue;
            }
            if(ep.type==='union' || ep.type==='enum'){
                prop.isValueType=true;
            }else if(ep.type==='typeDef'){
                const typeProp=ep.props.find(p=>p.name==='type');
                if(typeProp && valueTypes.includes(typeProp.typeName as any)){
                    prop.isValueType=true;
                }
            }
        }
    }
}

export async function processAsync(config:ProcessingConfig):Promise<ProcessingCtx>
{
    const ctx:ProcessingCtx={
        ...config,
        pass:0,
        maxPasses:defaultMaxPass,
        currentEntity:null,
        currentProp:null,
        genStack:[],
        entities:[],
        pluginMap:{}

    }

    if(ctx.plugins){
        for(const p of ctx.plugins){
            ctx.pluginMap[p.key]=p;
        }
    }

    for(const input of ctx.inputs){
        const entities=await input.handler(ctx);
        for(const e of entities){
            ctx.entities.push(e);
        }
    }

    await resolveCtxAsync(ctx);

    ctx.entities.sort((a,b)=>a.name.localeCompare(b.name));

    for(const output of ctx.outputs){
        await output.handler(ctx);
    }

    ctx.genStack=[];
    ctx.currentEntity=null;
    ctx.currentProp=null;

    return ctx;
}

export function getPlugin<T>(ctx:ProcessingCtx, pluginClass:{ new (): T }):T|null
{
    return ctx.pluginMap[(pluginClass as any).key] as any||null;
}

export function getFileName(filename:string)
{
    const i=Math.max(filename.lastIndexOf('/'),filename.lastIndexOf('\\'));
    return i===-1?filename:filename.substr(i+1);
}

export function getFileNameNoExt(filename:string)
{
    filename=getFileName(filename);
    const i=filename.lastIndexOf('.');
    return i===-1?filename:filename.substr(0,i);
}