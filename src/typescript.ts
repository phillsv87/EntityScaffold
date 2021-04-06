import * as fs from 'fs/promises';
import { firstToLower } from './entity-scaffold';
import { Entity, OutputHandler, ProcessingCtx } from "./types";

const tab='    ';
const tab2=tab+tab;

function mapType(type:string){
    switch(type){
        case 'int': return 'number';
        case 'string': return 'string';
        case 'double': return 'number';
        case 'bool': return 'boolean';
        default: return type;
    }
}

export const TypeScriptOutputHandler:OutputHandler=async (ctx:ProcessingCtx)=>{

    const tsOuts=ctx.args['--ts-out']?.split(',').map(o=>o.trim());
    const tsHeader=ctx.args['--ts-out-header'];
    const copyConstructors=ctx.args['--ts-cc']==='1';

    if(!tsOuts){
        throw new Error('--ts-out required');
    }

    const tsOut=tsOuts[0];

    const append=(content:string,newline:boolean=true)=>
        fs.appendFile(tsOut,content+(newline?'\n':''));

    await fs.writeFile(tsOut,
        '// this file was auto generated by the EntityScaffold typescript output handler\n');

    if(tsHeader){
        const header=await fs.readFile(tsHeader);
        await fs.appendFile(tsOut,header);
    }

    await append('\n');

    for(const entity of ctx.entities){
        switch(entity.type){

            case 'interface':{

                if(entity.documentPath){
                    await append(`export const ${entity.name}DocPath="${entity.documentPath}";`)
                }
                
                await append(`export interface ${entity.name}\n{`)

                for(const prop of entity.props){

                    if(prop.isPointer || prop.isQueryPointer){
                        continue;
                    }

                    await append(
                        `${tab}${prop.name}${(!prop.required && !prop.isId)?'?':''}:`+
                        `${mapType(prop.typeName)}${(prop.isCollection?'[]':'')}${prop.isNullable?'|null':''};`)
                }


                if(copyConstructors){
                    let anySources=false;
                    const sources=entity.props.reduce<{[type:string]:Entity}>((map,prop)=>{
                        if(prop.copySource){
                            const sourceE=ctx.entities.find(e=>e.name===prop.copySource?.entity);
                            if(!sourceE){
                                throw new Error(
                                    'Unable to find copySource entity. entity:'+entity.name+', prop:'+prop.name)
                            }
                            map[prop.copySource.entity]=sourceE;
                            anySources=true;
                        }
                        return map;
                    },{});

                    await append('}');

                    if(anySources){

                        const pick:string[]=[];
                        for(const prop of entity.props){
                            if(!prop.copySource && !prop.isPointer && !prop.isQueryPointer){
                                pick.push(prop.name);
                            }
                        }

                        let cArgCount=0;
                        let cOut=`export function create${entity.name}(`;
                        const pickVar=firstToLower(entity.name);
                        if(pick.length){
                            cArgCount++;
                            cOut+=`\n${tab}${pickVar}:Pick<${entity.name},`;
                            cOut+=pick.map(v=>JSON.stringify(v)).join('|')+'>';
                        }

                        for(const e in sources){
                            if(cArgCount){
                                cOut+=',';
                            }
                            const isOptional=entity.props
                                .some(p=>p.copySource?.entity===e && p.copySource.optional);
                            cArgCount++;
                            cOut+=`\n${tab}${firstToLower(e)}:${e+(isOptional?'|null':'')}`;
                        }

                        cOut+=`\n):${entity.name}{\n${tab}return deleteUndefined({`;

                        if(pick.length){
                            for(const prop of pick){
                                const eProp=entity.props.find(p=>p.name==prop);
                                if(eProp?.isValueType){
                                    cOut+=`\n${tab2}${prop}:${pickVar}.${prop},`;
                                }else{
                                    cOut+=`\n${tab2}${prop}:cloneObj(${pickVar}.${prop}),`;
                                }
                            }
                        }

                        for(const e in sources){
                            cOut+=`\n\n${tab2}// ${e}`;
                            const isOptional=entity.props
                                .some(p=>p.copySource?.entity===e && p.copySource.optional);
                            for(const prop of entity.props){
                                if(prop.copySource?.entity!==e || prop.isPointer || prop.isQueryPointer){
                                    continue;
                                }
                                if(prop.isValueType){
                                    cOut+=
                                        `\n${tab2}${prop.name}:${firstToLower(prop.copySource.entity)}`+
                                        `${isOptional?'?':''}.${prop.copySource.prop},`;
                                }else{
                                    cOut+=
                                        `\n${tab2}${prop.name}:cloneObj(${firstToLower(prop.copySource.entity)}`+
                                        `${isOptional?'?':''}.${prop.copySource.prop}),`;
                                }
                            }
                        }


                        cOut+=`\n${tab}});\n}`;

                        await append(cOut);

                    }
                }

                await append('\n\n');

                break;
            }

            case 'union':{
                let outType=`export type ${entity.name}=`;
                let outAll=`export const ${entity.name}All:${entity.name}[]=[`;

                let first=true;
                for(const prop of entity.props){
                    const val=JSON.stringify(prop.name);
                    if(first){
                        first=false;
                    }else{
                        outType+='|';
                        outAll+=',';
                    }
                    outType+=val;
                    outAll+=val;
                }

                outType+=';';
                outAll+='];';

                await append(outType+'\n'+outAll+'\n\n');
                break;
            }

            case 'typeDef':{
                const typeProp=entity.props.find(p=>p.name==='type');
                const formatProp=entity.props.find(p=>p.name==='format');
                const regProp=entity.props.find(p=>p.name==='regex');
                if(!typeProp){
                    throw new Error('typeDef requires a type prop. entity:'+entity.name)
                }
                let outp=`export type ${entity.name}=${typeProp.typeName};\n`;
                if(formatProp){
                    outp+=`export const ${entity.name}Format=${JSON.stringify(formatProp.typeName)};\n`;
                }
                if(regProp){
                    outp+=`export const ${entity.name}Regex=/${regProp.typeName}/;\n`;
                }
                await append(outp+'\n');
                break;
            }
        }
    }

    if(copyConstructors){
        await append(
`
const deleteUndefined=<T extends {[key:string]:any}>(obj:T):T=>
{
    if(!obj){
        return obj;
    }
    for(const e in obj){
        if(obj[e]===undefined){
            delete obj[e];
        }
    }

    return obj;
}

const cloneObj=<T>(obj:T, maxDepth=20):T=>
{
    if(maxDepth<0){
        throw new Error('cloneObj max depth reached');
    }
    maxDepth--;
    if(!obj || typeof obj !== 'object'){
        return obj;
    }

    if(Array.isArray(obj)){
        const clone=[];
        for(let i=0;i<obj.length;i++){
            clone.push(cloneObj(obj[i],maxDepth));
        }
        return clone as any;
    }else{
        const clone:any={}
        for(const e in obj){
            clone[e]=cloneObj(obj[e],maxDepth);
        }
        return clone;
    }

}
`
        );
    }


    for(let i=1;i<tsOuts.length;i++){
        fs.copyFile(tsOut,tsOuts[i]);
    }

}