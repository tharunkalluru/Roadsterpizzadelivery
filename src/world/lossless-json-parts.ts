/** Exact JSON byte transport. This codec conveys no road/source acceptance. */
const MAX_BYTES=64*1024*1024,MAX_NODES=100_000,MAX_PARTS=1_000_000,MAX_WORK=4*1024*1024,MAX_FILES=16,SHA=/^[a-f0-9]{64}$/;
function ensure(value:unknown,message:string):asserts value{if(!value)throw Error(message);}
function keys(value:unknown,expected:string[]){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===expected.slice().sort().join('|');}
function validText(value:string){
  // Literal halves may not be encoded separately: UTF-8 would replace them.
  // JSON spellings such as "\\ud800" remain ordinary ASCII and are preserved.
  for(let i=0;i<value.length;i++){const c=value.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const next=value.charCodeAt(++i);ensure(next>=0xdc00&&next<=0xdfff,'A JSON dictionary contains invalid Unicode.');}else ensure(c<0xdc00||c>0xdfff,'A JSON dictionary contains invalid Unicode.');}
}
export interface LosslessJSONFile{root:number;bytes:number;sha256:string;}
export interface LosslessJSONPartsReader{files:Readonly<Record<string,Readonly<LosslessJSONFile>>>;read(role:string,expectedBytes:number,expectedSHA256:string):Uint8Array;}
function guardJSONShape(text:string){
  // Bound container allocation before JSON.parse. Original nested JSON occurs
  // inside quoted literal strings; the dictionary itself has only three levels.
  let quoted=false,escaped=false,depth=0,containers=0,separators=0;
  for(let i=0;i<text.length;i++){
    const c=text[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
    if(c==='"')quoted=true;
    else if(c==='['||c==='{'){depth++;containers++;ensure(depth<=4&&containers<=MAX_NODES+MAX_FILES+4,'The JSON dictionary structure exceeds its limits.');}
    else if(c===']'||c==='}')depth--;
    else if(c===',')ensure(++separators<=MAX_PARTS+MAX_NODES+MAX_FILES*4+8,'The JSON dictionary structure exceeds its limits.');
  }
}
export function openLosslessJSONParts(bytes:Uint8Array):LosslessJSONPartsReader{
  ensure(bytes.byteLength>0&&bytes.byteLength<=MAX_BYTES,'The JSON dictionary exceeds its size limit.');
  ensure(!(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf),'The JSON dictionary cannot contain a BOM.');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);guardJSONShape(text);const document:unknown=JSON.parse(text);
  ensure(keys(document,['version','kind','files','nodes']),'Invalid JSON dictionary fields.');
  const data=document as {version:unknown;kind:unknown;files:Record<string,LosslessJSONFile>;nodes:unknown[]};
  ensure(data.version===1&&data.kind==='lossless-json-parts-v1','Unsupported JSON dictionary.');
  ensure(Array.isArray(data.nodes)&&data.nodes.length>0&&data.nodes.length<=MAX_NODES,'Invalid JSON dictionary nodes.');
  ensure(data.files&&typeof data.files==='object'&&!Array.isArray(data.files)&&Object.keys(data.files).length>0&&Object.keys(data.files).length<=MAX_FILES,'Invalid JSON dictionary files.');
  const encoder=new TextEncoder(),lengths:number[]=[],work:number[]=[],nodes:(Uint8Array|number)[][]=[];
  let partsCount=0,literalBytes=0;
  for(const [index,raw]of data.nodes.entries()){
    ensure(Array.isArray(raw)&&raw.length>0,'A JSON dictionary node is empty.');
    ensure((partsCount+=raw.length)<=MAX_PARTS,'The JSON dictionary has too many parts.');
    const parts:(Uint8Array|number)[]=[];let length=0,steps=0;
    for(const part of raw){
      if(typeof part==='string'){
        validText(part);const encoded=encoder.encode(part);literalBytes+=encoded.byteLength;
        ensure(literalBytes<=MAX_BYTES,'JSON dictionary literals exceed their size limit.');
        parts.push(encoded);length+=encoded.byteLength;steps++;
      }else{
        ensure(Number.isSafeInteger(part)&&part>=0&&part<index,'JSON dictionary references must point to an earlier node.');
        parts.push(part);length+=lengths[part];steps+=work[part]+1;
      }
      ensure(Number.isSafeInteger(length)&&length<=MAX_BYTES,'A JSON dictionary node expands beyond its size limit.');
      // Also bound empty-string DAGs, which can have little output but huge work.
      ensure(Number.isSafeInteger(steps)&&steps<=MAX_WORK,'A JSON dictionary node requires too much work.');
    }
    nodes.push(parts);lengths.push(length);work.push(steps);
  }
  const files=Object.create(null)as Record<string,Readonly<LosslessJSONFile>>;
  for(const [role,file]of Object.entries(data.files)){
    ensure(/^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(role)&&!['constructor','prototype','__proto__'].includes(role),'Invalid JSON dictionary role.');
    ensure(keys(file,['root','bytes','sha256'])&&Number.isSafeInteger(file.root)&&file.root>=0&&file.root<nodes.length,'Invalid JSON dictionary root.');
    ensure(Number.isSafeInteger(file.bytes)&&file.bytes>0&&file.bytes<=MAX_BYTES&&file.bytes===lengths[file.root]&&SHA.test(file.sha256),'Invalid JSON dictionary file binding.');
    files[role]=Object.freeze({...file});
  }
  Object.freeze(files);
  return Object.freeze({files,read(role:string,expectedBytes:number,expectedSHA256:string){
    const file=files[role];ensure(file&&file.bytes===expectedBytes&&file.sha256===expectedSHA256,'A JSON dictionary file differs from the release binding.');
    const output=new Uint8Array(file.bytes);let offset=0;
    const stack=[{node:file.root,index:0}];
    while(stack.length){const frame=stack[stack.length-1],parts=nodes[frame.node];if(frame.index===parts.length){stack.pop();continue;}
      const part=parts[frame.index++];if(typeof part==='number')stack.push({node:part,index:0});else{output.set(part,offset);offset+=part.byteLength;}}
    ensure(offset===file.bytes,'A JSON dictionary file is incomplete.');return output;
  }});
}
