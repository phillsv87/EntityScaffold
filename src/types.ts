export type InputHandler=(ctx:ProcessingCtx, source:string)=>Promise<Entity[]>;
export interface Input
{
    source:string;
    handler:InputHandler;
}

export type OutputHandler=(ctx:ProcessingCtx, destination:string)=>Promise<void>;
export interface Output
{
    destination:string;
    handler:OutputHandler;
}

export type GeneratorFactory=(name:string,args:string[])=>Generator;

export interface ProcessingConfig
{
    args:{[arg:string]:string};
    inputs:Input[];
    outputs:Output[];
    generatorFactories:{[name:string]:GeneratorFactory}
}

export type SysType=
    'int'|
    'string'|
    'double'|
    'bool'|
    'Timestamp'|
    'other'; // any other types
export const allSysTypes:SysType[]=[
    'int',
    'string',
    'double',
    'bool',
    'Timestamp',
]

export type EntityType=                   'interface'|'enum'|'union'|'typeDef';
export const allEntityTypes:EntityType[]=['interface','enum','union','typeDef'];

export const defaultEntityType:EntityType='interface';

export type OpCommand='copy'|'startSource'|'endSource'|'startPublic'|'endPublic';

export type StartEnd=                 '@start'|'@end';
export const allStartEnds:StartEnd[]=['@start','@end']
export const startGen:StartEnd='@start';
export const endGen:StartEnd='@end';

export interface Entity
{
    name:string;
    type:EntityType;
    props:Prop[];
    ops:Op[];
    opDepsResolved:boolean;
    documentPath:string|null;
    resolved:boolean;
}

export interface Op
{
    prop?:Prop;
    startEnd?:StartEnd;
    generators?:Generator[];
}

export interface Prop
{
    name:string;
    isId:boolean;
    type:SysType;
    typeName:string;
    isNullable:boolean;
    isSysType:boolean;
    isQueryPointer:boolean;
    isPointer:boolean;
    isCollection:boolean;
    comment:string|null,
    /** If true the property has had all of its generates ran and is ready for output */
    resolved:boolean;

    /** An array of sources the property is apart of */
    sources:string[];

    attAry:Att[];
    atts:{[name:string]:any};

    /**
     * Generators can generate attributes or more generators.
     * As generators are ran the are removed from this array
     */
    generators:Generator[];
}

export class Generator
{
    name:string;
    args:string[];
    resolved:boolean;
    
    constructor(name:string, args:string[])
    {
        this.name=name;
        this.args=args;
        this.resolved=false;
    }

    getDeps(ctx:ProcessingCtx):Entity[]
    {
        return [];
    }

    /**
     * Preforms the work of the generator. The generator should always complete its work.
     * Only prop or op is not null, both will never be not null at the same time.
     * @param ctx The processing ctx
     * @param prop If the generator is operating on a Prop then prop is set
     * @param op If the generator is operating on an Op then op is set
     */
    executeAsync(ctx:ProcessingCtx, prop:Prop|null, op:Op|null):Promise<void>
    {
        return new Promise<void>((r)=>r());
    }
}

export interface Att
{
    name:string
    value:any;
}

export interface ProcessingCtx extends ProcessingConfig
{
    entities:Entity[];

    currentEntity:Entity|null;

    currentProp:Prop|null;

    /** Array of active start/end ops */
    genStack:Generator[];

    /** The current pass index. Each time the ctx processes all entities pass is incremented */
    pass:number;

    /** If pass exceeds this value processing is stopped and an error is thrown */
    maxPasses:number;
}
