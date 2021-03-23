export type Row={[col:string]:string}

export const lineColName='__LINE__';
const lineSep='\u2028';

function splitLine(line:string){
    return line.split(',').map(s=>s.split('"').join(''))
}

export function parseCsv(content:string, fixUnescapedNewlines?:boolean):Row[]
{
    const rows:Row[]=[];
    let header:string[]=[];

    const lines=content.split('\n');


    if(fixUnescapedNewlines){
        for(let i=lines.length-1;i>0;i--){
            const parts=lines[i].split(',');
            if(Number.isNaN(Number(parts[0]))){
                lines[i-1]+='\n'+lines[i];
                lines[i]='';
            }
        }
    }

    let first=true;
    let lineNum=0;
    for(let line of lines){
        lineNum++;
        line=line.split(lineSep).join('\n').trim();
        if(!line){
            continue;
        }

        const cols=splitLine(line);

        if(first){
            header=cols;
            first=false;
            continue;
        }

        const row:Row={}
        row[lineColName]=lineNum.toString();
        for(let i=0;i<header.length;i++){
            const h=header[i];
            if(!h){
                continue;
            }
            row[h]=cols[i]||'';
        }
        rows.push(row);


    }

    return rows;
}