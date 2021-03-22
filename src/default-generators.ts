import { Entity, Generator, GeneratorFactory, Op, ProcessingCtx, Prop } from "./types";
import { cloneObj } from "./util";


/*
- @start
- @end
- @id - marks a property as the id for a type. By default if the first property of a type ends with "Id" it is 
- @source {sourceName} - Adds an individual property to a source block
- *@exclude {sourceName} - excludes a property from a source block
- *@copyValue {type} {propName} - copies the value of a property from another type
- @copy {type} {sourceName} forward:{forwardSource?} prefix:{prefixValue?} optional:{bool?}
  - copies properties marked for copying by the given name
  - {type} - the type to copy from
  - {sourceName} - name of the source to copy from
  - forward:{forwardSource} - if specified the copy properties will be added as a source by the given name
  - prefix:{prefixValue} - Adds a prefix to the names of the source properties. Casing is adjusted
  - optional:{bool} - if true the copy constructor marks the copy source as optional
 */
export function createDefaultFactories():{[name:string]:GeneratorFactory}
{

    return {
        "@source":(name,args)=>new SourceGenerator(name,args),
        "@id":(name,args)=>new IdGenerator(name,args),
        "@start":(name,args)=>new StartGenerator(name,args),
        "@end":(name,args)=>new EndGenerator(name,args),
        "@copy":(name,args)=>new CopyGenerator(name,args),
        "@copyValue":(name,args)=>new CopyValueGenerator(name,args),

    }
}


 export class SourceGenerator extends Generator
 {
     async executeAsync(ctx:ProcessingCtx, prop:Prop|null, op:Op|null):Promise<void>
     {
         if(prop){
             for(const s of this.args){
                 if(!prop.sources.includes(s)){
                     prop.sources.push(s);
                 }
             }
         }
         this.resolved=true;
     }
 }

 export class IdGenerator extends Generator
 {
     async executeAsync(ctx:ProcessingCtx, prop:Prop|null, op:Op|null):Promise<void>
     {
         if(!ctx.currentEntity || !prop){
             this.resolved=true;
             return;
         }
         for(const oProp of ctx.currentEntity.props){
             oProp.isId=false;
         }
         prop.isId=true;
         this.resolved=true;
     }
 }

 export class StartGenerator extends Generator
 {
     async executeAsync(ctx:ProcessingCtx, prop:Prop|null, op:Op|null):Promise<void>
     {

         if(!op?.generators){
             throw new Error('@start requires an op');
         }
         
         for(let i=1;i<op.generators.length;i++){
             const gen=op.generators[i];
             gen.resolved=true;
             ctx.genStack.push(gen);
         }

         this.resolved=true;
     }
 }

 export class EndGenerator extends Generator
 {
     async executeAsync(ctx:ProcessingCtx, prop:Prop|null, op:Op|null):Promise<void>
     {

         if(!op?.generators){
             throw new Error('@end requires an op');
         }
         
         for(const name of this.args){
             const i=ctx.genStack.findIndex(g=>g.name===name);
             if(i===-1){
                 throw new Error('Invalid @end generator name - '+name);
             }
             ctx.genStack.splice(i,1);
         }

         this.resolved=true;
     }
 }

 export class CopyGenerator extends Generator
 {

     getDeps(ctx:ProcessingCtx):Entity[]
     {
         const typeName=this.args[0];
         const deps=ctx.entities.filter(t=>t.name===typeName);
         if(deps.length!==1){
             throw new Error('@copy did not match exactly 1 type. type:'+typeName)
         }
         return deps;
     }

     async executeAsync(ctx:ProcessingCtx, prop:Prop|null, op:Op|null):Promise<void>
     {

         if(!op){
             throw new Error('@copy should only be applied directly to an entity');
         }

         const typeName=this.args[0];
         const source=this.args[1];
         const forward=this.args[2];
         const prefix=this.args[3];
         const optional=this.args[4]?Boolean(this.args[4]):false;

         if(!source){
             throw new Error('@copy source arg required. type:'+typeName);
         }

        const sourceType=ctx.entities.find(t=>t.name===typeName);
         if(!sourceType){
             throw new Error('@copy did not found its source type. type:'+typeName);
         }

         const props=sourceType.props.filter(p=>p.sources.includes(source));

         for(let prop of props){
            prop={
                ...prop,
                isId:false,
                sources:[],
                atts:cloneObj(prop.atts),
                attAry:cloneObj(prop.attAry)
            }
            prop.attAry.push({name:'copy-from',value:{type:typeName,prop:prop.name}})

            if(forward){
                prop.sources.push(forward);
            }

            if(prefix){
                prop.name=prefix+prop.name[0].toUpperCase()+prop.name.substr(1);
            }


            // todo - account for optional

            ctx.currentEntity?.props.push(prop);
         }

         this.resolved=true;
     }
 }

 export class CopyValueGenerator extends Generator
 {

     getDeps(ctx:ProcessingCtx):Entity[]
     {
         const typeName=this.args[0];
         const deps=ctx.entities.filter(t=>t.name===typeName);
         if(deps.length!==1){
             throw new Error('@copyValue did not match exactly 1 type. type:'+typeName)
         }
         return deps;
     }

     async executeAsync(ctx:ProcessingCtx, prop:Prop|null, op:Op|null):Promise<void>
     {

         // todo

         this.resolved=true;
     }
 }