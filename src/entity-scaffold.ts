import * as fs from 'fs/promises';
import { allEntityTypes, allStartEnds, allSysTypes, Generator, Entity, EntityType, Op, ProcessingConfig, ProcessingCtx, Prop, startGen } from "./types";


const defaultMaxPass=10000;

const AliasMap:{[key:string]:string}={
    '@startSource':'@start @source',
    '@endSource':'@end source',
    '@startPublic':'@start @source public',
    '@endPublic':'@end public',
    '@public':'@source public',
}

export function unAlias(value:string){
    for(const e in AliasMap){
        value=value.split(e).join(AliasMap[e]);
    }
    return value;
}

export function toEntityType(type:string):EntityType{
    if(!allEntityTypes.includes(type as any)){
        throw new Error(type+' is not an EntityType');
    }
    return type as any;
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

export function parseOpString(ctx:ProcessingCtx, opStr:string, entityType:EntityType):Op|null
{
    opStr=opStr?.trim();
    if(!opStr){
        return null;
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

    let [name,type]=parts[0].split(':').map(s=>s.trim());
    if(entityType==='union' && !type){
        type='string';
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

    type=type
        .split('*').join('')
        .split(' ').join('')
        .split('?').join('')
        .split('[').join('')
        .split(']').join('');

    const isSysType=allSysTypes.includes(type as any);

    parts=[...parts];
    parts.shift();
    return {
        name,
        comment:null,
        isId:name.toLowerCase()==='id',
        type:isSysType?type as any:'other',
        typeName:type,
        isNullable,
        isSysType,
        isQueryPointer,
        isPointer,
        isCollection,
        resolved:false,
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
                entity.props.push(op.prop);
                for(const sOp of ctx.genStack){
                    const clone=createGenerator(ctx,sOp.name,sOp.args);
                    op.prop.generators.push(clone);
                }

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

    }

    for(const input of ctx.inputs){
        const entities=await input.handler(ctx,input.source);
        for(const e of entities){
            ctx.entities.push(e);
        }
    }

    await resolveCtxAsync(ctx);

    for(const output of ctx.outputs){
        await output.handler(ctx,output.destination);
    }

    ctx.genStack=[];
    ctx.currentEntity=null;
    ctx.currentProp=null;

    return ctx;
}