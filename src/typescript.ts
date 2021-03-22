import * as fs from 'fs/promises';
import { OutputHandler, ProcessingCtx } from "./types";

const tab='    ';

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

    const tsOut=ctx.args['--ts-out'];
    const tsHeader=ctx.args['--ts-out-header'];

    if(!tsOut){
        throw new Error('--ts-out required');
    }

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
                
                await append(`export interface ${entity.name}\n{`)

                for(const prop of entity.props){

                    if(prop.isPointer || prop.isQueryPointer){
                        continue;
                    }

                    await append(`${tab}${prop.name}:${mapType(prop.typeName)+(prop.isCollection?'[]':'')};`)
                }

                await append('}\n\n')
                break;
            }

            case 'union':{
                let outType=`export type ${entity.name}=`;
                let outAll=`export const ${entity.name}All=[`;

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

}