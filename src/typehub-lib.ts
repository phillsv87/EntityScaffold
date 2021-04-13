import { Plugin } from "./types";

export class TypeHubPlugin extends Plugin
{

    public static get key(){return 'type-hub'};

    private _imports:TypeHubImport[]=[];
    private _members:TypeHubMember[]=[];

    public get imports():readonly TypeHubImport[]{return this._imports}
    public get members():readonly Readonly<TypeHubMember>[]{return this._members}

    constructor()
    {
        super(TypeHubPlugin.key)
    }

    public addImport(_import:TypeHubImport):TypeHubPlugin{
        this._imports.push({..._import});
        return this;
    }

    public addImports(imports:TypeHubImport[]):TypeHubPlugin{
        for(const _import of imports){
            this._imports.push({..._import});
        }
        return this;
    }

    public addMember(member:TypeHubMember):TypeHubPlugin
    {
        this._members.push({...member});
        return this;
    }

    public getTypeMap()
    {
        this._members.sort((a,b)=>a.typeName.localeCompare(b.typeName));
        return this._members.reduce((m,v)=>{
            if(!m[v.typeName]){
                m[v.typeName]=[];
            }
            m[v.typeName].push(v);
            return m;
        },{} as {[type:string]:TypeHubMember[]});
    }
    public getImportLines()
    {
        this._imports.sort((a,b)=>a.from.localeCompare(b.from));
        const mapped=this._imports.reduce((m,v)=>{
            let l=m[v.from];
            if(!l){
                l=m[v.from]=[];
            }
            if(!l.some(i=>i.name===v.name)){
                l.push(v);
            }
            return m;
        },{} as {[type:string]:TypeHubImport[]});

        const lines:string[]=[];
        for(const e in mapped)
        {
            const named=mapped[e].filter(i=>!i.isDefault);
            const defaultImport=mapped[e].find(i=>i.isDefault);

            let line=named.length==0?'':'{ '+named.map(n=>n.name).join(', ')+' }';
            if(defaultImport){
                line=defaultImport+(line?', '+line:'')
            }
            line=`import ${line} from '${mapped[e][0].from}';`;
            lines.push(line);
        }
        return lines;
    }
}


export interface TypeHubMember
{
    typeName:string;
    memberBody:string;
}

export interface TypeHubImport
{
    name:string;
    from:string;
    isDefault?:boolean;
}