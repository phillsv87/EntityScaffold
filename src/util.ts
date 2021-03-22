export function cloneObj<T>(obj:T, maxDepth=20):T
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