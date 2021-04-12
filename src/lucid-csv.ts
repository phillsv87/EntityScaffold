import * as fs from 'fs/promises';
import { lineColName, parseCsv } from './csv';
import { parseEntityString, parseOpString } from './entity-scaffold';
import { Entity, InputHandler, ProcessingCtx } from './types';


const shapeKey='Shape Library';
const entityShape='Entity Relationship';
const typeKey='Text Area 1';

export const lucidCsvInputHandler:InputHandler=async (ctx:ProcessingCtx)=>
{

    const source:string=ctx.args['--lucid-csv'];
    if(!source){
        throw new Error('--lucid-csv required');
    }

    const entities:Entity[]=[];

    const csv=parseCsv((await fs.readFile(source)).toString(),true);
    
    for(const row of csv){

        if(row[shapeKey]!==entityShape){
            continue;
        }

        let entity:Entity;

        try{
            entity=parseEntityString(ctx,row[typeKey]);
        }catch(ex){
            console.error('Entity parse error, Line:'+row[lineColName])
            throw ex;
        }
        


        for(let i=2;;i++){
            let opStr=row['Text Area '+i];
            if(opStr===undefined){
                break;
            }
            try{
                const op=parseOpString(ctx,opStr,entity.type);
                if(op){
                    entity.ops.push(op);
                }
            }catch(ex){
                console.error('Entity:'+entity.name+', Line:'+row[lineColName])
                throw ex;
            }

        }
        entities.push(entity);



    }

    return entities;
}