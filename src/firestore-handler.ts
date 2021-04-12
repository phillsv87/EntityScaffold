import * as fs from 'fs/promises';
import { firstToLower } from './entity-scaffold';
import { OutputHandler, ProcessingCtx } from "./types";

const idReg=/\{(\w+)\}/g;

export const FirestoreOutputHandler:OutputHandler=async (ctx:ProcessingCtx)=>{
    
    const tsOuts=ctx.args['--firestore-out']?.split(',').map(o=>o.trim());
    const tsHeader=ctx.args['--firestore-out-header'];
    const typesPath=ctx.args['--firestore-types-path'];

    if(!tsOuts){
        return;
    }

    if(!typesPath){
        throw new Error('--firestore-types-path required');
    }

    const tsOut=tsOuts[0];

    const append=(content:string,newline:boolean=true)=>
        fs.appendFile(tsOut,content+(newline?'\n':''));

    await fs.writeFile(tsOut,
'// this file was auto generated by the EntityScaffold firestore output handler\n');

    const types=ctx.entities.filter(t=>t.documentPath && t.type==='interface');

    await append('import { '+types.map(t=>t.name).join(', ')+' } from \''+typesPath+'\';\n');

    if(tsHeader){
        const header=await fs.readFile(tsHeader);
        await fs.appendFile(tsOut,header);
    }

    await append('\n');

    for(const type of types){

        if(!type.documentPath){
            continue;
        }

        const ids=[...type.documentPath.matchAll(idReg)]
        if(!ids || ids.length===0){
            return;
        }

        const lName=firstToLower(type.name);

        const idParams=ids.map(i=>i[1]+':string').join(', ');
        const idParamValues=ids.map(i=>i[1]).join(',');
        const idObjParams=ids.map(i=>`${lName}.${i[1]}||''`).join(',');

        const checkIds=ids.map(i=>(`
    if(!${i[1]}){throw new Error('get${type.name}Doc requires ${i[1]}')}`)).join('')

        const path=type.documentPath.split('{').join('${');

        await append(
`export function get${type.name}Doc(${idParams}):DocumentReference<DocumentData>
{
    ${checkIds}
    return db().doc(\`${path}\`);
}
export function get${type.name}DocByRef(${lName}:${type.name}):DocumentReference<DocumentData>
{
    return get${type.name}Doc(${idObjParams});
}
export async function get${type.name}Async(${idParams}, trans?:Transaction|null):Promise<${type.name}|null>
{
    const docRef=get${type.name}Doc(${idParamValues});
    const doc=await (trans?trans.get(docRef):docRef.get());
    return doc.exists?doc.data() as ${type.name}:null;
}
export function get${type.name}ByRefAsync(${lName}:${type.name}, trans?:Transaction|null):Promise<${type.name}|null>
{
    return get${type.name}Async(${idObjParams},trans);
}\n\n`);
    }


    for(let i=1;i<tsOuts.length;i++){
        fs.copyFile(tsOut,tsOuts[i]);
    }

}