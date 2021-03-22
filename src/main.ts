import * as fs from 'fs/promises';
import { createDefaultFactories } from './default-generators';
import { processAsync } from './entity-scaffold';
import { lucidCsvInputHandler } from './lucid-csv';

console.log('entity-scaffold')

//npm run build -- -arg value

const args=process.argv.reduce((args,v,index,ary)=>{
    if(v[0]==='-'){
        args[v]=ary[index+1]||'';
    }
    return args;
},{} as {[key:string]:string});

if(!args['-src']){
    console.error('-src required');
    process.exit(1);
}


async function processModelAsync()
{
    try{
        const ctx=await processAsync({
            args,
            inputs:[{
                source:args['-src'],
                handler:lucidCsvInputHandler
            }],
            outputs:[

            ],
            generatorFactories:createDefaultFactories()
        });

        await fs.writeFile('../entities.json',JSON.stringify(ctx,undefined,4))

    }catch(ex){
        console.error(ex);
    }
}


processModelAsync();