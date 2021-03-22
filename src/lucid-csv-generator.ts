import * as fs from 'fs/promises';
import { lineColName, lineSep, parseCsv } from './csv';
import { parseOpString, toEntityType } from './entity-scaffold';
import { defaultEntityType, Entity, EntityType, Op, InputHandler, ProcessingCtx } from './types';


const shapeKey='Shape Library';
const entityShape='Entity Relationship';
const typeKey='Text Area 1';

export const lucidCsvGenerator:InputHandler=async (ctx:ProcessingCtx, source:string)=>
{
    const entities:Entity[]=[];

    const csv=parseCsv((await fs.readFile(source)).toString(),true);
    
    for(const row of csv){

        if(row[shapeKey]!==entityShape){
            continue;
        }

        const [typeParts,documentPath]=row[typeKey].split(lineSep).map(s=>s.trim());

        const [name,_type]=typeParts.split(':').map(s=>s.trim());
        let type:EntityType;
        
        try{
            type=toEntityType(_type||defaultEntityType);
        }catch(ex){
            console.error('Entity:'+name+', Line:'+row[lineColName])
            throw ex;
        }

        const ops:Op[]=[];

        for(let i=2;;i++){
            let opStr=row['Text Area '+i];
            if(opStr===undefined){
                break;
            }
            if(opStr.includes(lineSep)){
                opStr=opStr.split(lineSep).join('\n');
            }
            try{
                const op=parseOpString(ctx,opStr,type);
                if(op){
                    ops.push(op);
                }
            }catch(ex){
                console.error('Entity:'+name+', Line:'+row[lineColName])
                throw ex;
            }

        }

        const entity:Entity={
            name,
            type,
            documentPath:documentPath||null,
            opDepsResolved:false,
            resolved:false,
            props:[],
            ops,
        }
        entities.push(entity);



    }

    return entities;
}