import * as fs from 'fs/promises';
import { firstToLower, getFileNameNoExt, getPlugin } from './entity-scaffold';
import { TypeHubPlugin } from './typehub-lib';
import { OutputHandler, ProcessingCtx } from "./types";

const idReg=/\{(\*\*)?(\w+)\}/g;

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

    const typeHub=getPlugin(ctx,TypeHubPlugin);

    const tsOut=tsOuts[0];

    const importName='./'+getFileNameNoExt(tsOut);

    const append=(content:string,newline:boolean=true)=>
        fs.appendFile(tsOut,content+(newline?'\n':''));

    await fs.writeFile(tsOut,
'// this file was auto generated by the EntityScaffold firestore output handler\n');

    const types=ctx.entities.filter(t=>t.documentPath && t.type==='interface');

    await append('import { '+types.map(t=>t.name).join(', ')+' } from \''+typesPath+'\';\n');
    if(typeHub){
        typeHub.addImports(types.map(t=>({
            from:typesPath,
            name:t.name
        })))
    }

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

        const idParams=ids.map(i=>i[2]+':string').join(', ');
        const idParamValues=ids.map(i=>i[2]).join(',');
        const idObjParams=ids.map(i=>`${lName}.${i[2]}||''`).join(',');

        const checkIds=ids.map(i=>(`
    ${i[1]?'validateDocPath':'validateDocId'}(${i[2]},'${type.name}.${i[2]}');`)).filter(i=>i).join('')

        const path=type.documentPath.split('{').join('${').split('*').join('');

        await append(
`export function get${type.name}DocPath(${idParams}):string
{
    ${checkIds}
    return \`${path}\`;
}
export function get${type.name}DocPathByRef(${lName}:${type.name}):string
{
    return get${type.name}DocPath(${idObjParams});
}
export function get${type.name}Doc(${idParams}):DocumentReference<DocumentData>
{
    return db().doc(get${type.name}DocPath(${idParamValues}));
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
}
export async function create${type.name}Async(${lName}:${type.name}):Promise<${type.name}>
{
    await db().doc(get${type.name}DocPathByRef(${lName})).create(${lName});
    return ${lName};
}
export function create${type.name}Trans(${lName}:${type.name}, trans:Transaction):${type.name}
{
    trans.create(get${type.name}DocByRef(${lName}),${lName});
    return ${lName};
}\n\n`);

        if(typeHub){
            typeHub
                .addImport({
                    name:`get${type.name}DocPath`,
                    from:importName
                })
                .addImport({
                    name:`get${type.name}DocPathByRef`,
                    from:importName
                })
                .addImport({
                    name:`get${type.name}Doc`,
                    from:importName
                })
                .addImport({
                    name:`get${type.name}DocByRef`,
                    from:importName
                })
                .addImport({
                    name:`get${type.name}Async`,
                    from:importName
                })
                .addImport({
                    name:`get${type.name}ByRefAsync`,
                    from:importName
                })
                .addImport({
                    name:`create${type.name}Async`,
                    from:importName
                })
                .addImport({
                    name:`create${type.name}Trans`,
                    from:importName
                })
                .addMember({
                    typeName:type.name,
                    memberBody:`public docPath(${idParams}){return get${type.name}DocPath(${idParamValues})}`,
                })
                .addMember({
                    typeName:type.name,
                    memberBody:`public docPathByRef(${lName}:${type.name}){return get${type.name}DocPathByRef(${lName})}`,
                })
                .addMember({
                    typeName:type.name,
                    memberBody:`public doc(${idParams}){return get${type.name}Doc(${idParamValues})}`,
                })
                .addMember({
                    typeName:type.name,
                    memberBody:`public docByRef(${lName}:${type.name}){return get${type.name}DocByRef(${lName})}`,
                })
                .addMember({
                    typeName:type.name,
                    memberBody:`public getAsync(${idParams}, trans?:Transaction|null){return get${type.name}Async(${idParamValues},trans)}`,
                })
                .addMember({
                    typeName:type.name,
                    memberBody:`public getByRefAsync(${lName}:${type.name}, trans?:Transaction|null){return get${type.name}ByRefAsync(${lName},trans)}`,
                })
                .addMember({
                    typeName:type.name,
                    memberBody:`public async createAsync(${lName}:${type.name}){return await create${type.name}Async(${lName})}`,
                })
                .addMember({
                    typeName:type.name,
                    memberBody:`public createTrans(${lName}:${type.name}, trans:Transaction){return create${type.name}Trans(${lName},trans)}`,
                });
        }

    }

    await append(
`
export function isValidDocId(id:string|null|undefined)
{
    return (
        id &&
        id.indexOf('/')===-1 &&
        id!=='.' &&
        id!=='..' &&
        !(id.startsWith('__') && id.endsWith('__'))
    )?true:false
}

export function validateDocId(id:string|null|undefined, msg?:string)
{
    if(!isValidDocId(id)){
        throw new Error('Invalid document Id'+(msg?'. '+msg:''));
    }
}

export function isValidDocPath(path:string|null|undefined){
    if(!path){
        return false;
    }
    const parts=path.split('/');
    for(const p of parts){
        if(!isValidDocId(p)){
            return false;
        }
    }
    return true;
}

export function validateDocPath(path:string|null|undefined, msg?:string)
{
    if(!isValidDocPath(path)){
        throw new Error('Invalid document path'+(msg?'. '+msg:''));
    }
}
`)


    for(let i=1;i<tsOuts.length;i++){
        fs.copyFile(tsOut,tsOuts[i]);
    }

}
