import * as fs from 'fs/promises';
import { createDefaultFactories } from './default-generators';
import { processAsync } from './entity-scaffold';
import { FirestoreOutputHandler } from './firestore-handler';
import { lucidCsvInputHandler } from './lucid-csv';
import { TypeScriptOutputHandler } from './typescript-handler';

console.log('entity-scaffold')

//npm run build -- -arg value

const args=process.argv.reduce((args,v,index,ary)=>{
    if(v[0]==='-'){
        args[v]=ary[index+1]||'';
    }
    return args;
},{} as {[key:string]:string});


async function processModelAsync()
{
    try{
        const ctx=await processAsync({
            args,
            inputs:[{
                handler:lucidCsvInputHandler
            }],
            outputs:[
                {handler:TypeScriptOutputHandler},
                {handler:FirestoreOutputHandler},
            ],
            generatorFactories:createDefaultFactories()
        });

        const ctxOut=args['--ctx-out'];
        if(ctxOut){
            await fs.writeFile(ctxOut,JSON.stringify(ctx,undefined,4));
        }

    }catch(ex){
        console.error(ex);
        process.exit(1);
    }
}


processModelAsync();