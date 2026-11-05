// Offline byte-preserving JSON dictionary builder. Never normalizes source JSON.
import {createHash}from'node:crypto';
import {gzipSync,gunzipSync}from'node:zlib';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const MAX_BYTES=64*1024*1024;
export function packLosslessJSONParts(inputs){
  const nodes=[],seen=new Map(),files={};let position=0,text='';
  function intern(start,end,parts){const raw=text.slice(start,end),key=sha(raw),prior=seen.get(key);if(prior){if(prior.raw!==raw)throw Error('Dictionary hash collision');return prior.id;}const id=nodes.length;nodes.push(parts);seen.set(key,{raw,id});return id;}
  function whitespace(){while(position<text.length&&/[\x20\x09\x0a\x0d]/.test(text[position]))position++;}
  function string(){if(text[position++]!=='"')throw Error('Expected JSON string');while(position<text.length){const c=text[position++];if(c==='\\'){position++;continue;}if(c==='"')return;}throw Error('Unclosed JSON string');}
  function value(depth=0){
    if(depth>256)throw Error('JSON nesting exceeds the transport limit');
    whitespace();const start=position,c=text[position],parts=[];let cursor=start;
    if(c==='['||c==='{'){
      position++;whitespace();const close=c==='['?']':'}';
      if(text[position]!==close)for(;;){if(c==='{'){string();whitespace();if(text[position++]!==':')throw Error('Expected colon');}
        const child=value(depth+1);if(child.ref!==null){parts.push(text.slice(cursor,child.start),child.ref);cursor=child.end;}
        whitespace();if(text[position]===close)break;if(text[position++]!==',')throw Error('Expected comma');whitespace();}
      position++;
    }else if(c==='"')string();else while(position<text.length&&!/[\s,}\]]/.test(text[position]))position++;
    const end=position;parts.push(text.slice(cursor,end));return{start,end,ref:end-start>=128?intern(start,end,parts):null};
  }
  if(!inputs||Object.keys(inputs).length<1||Object.keys(inputs).length>16)throw Error('Invalid input inventory');
  for(const[role,input]of Object.entries(inputs)){
    if(!/^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(role)||['constructor','prototype','__proto__'].includes(role))throw Error('Invalid input role');
    const bytes=Buffer.from(input);if(!bytes.length||bytes.length>MAX_BYTES)throw Error('Input exceeds the JSON size limit');
    if(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)throw Error('JSON byte transport does not accept a BOM');
    text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);JSON.parse(text);position=0;
    const parsed=value();whitespace();if(position!==text.length)throw Error('Unexpected JSON suffix');
    const root=parsed.ref===null?intern(0,text.length,[text]):intern(0,text.length,[text.slice(0,parsed.start),parsed.ref,text.slice(parsed.end)]);
    files[role]={root,bytes:bytes.length,sha256:sha(bytes)};
  }
  const dictionary=Buffer.from(JSON.stringify({version:1,kind:'lossless-json-parts-v1',files,nodes})+'\n');
  if(dictionary.length>MAX_BYTES||nodes.length>100_000)throw Error('Dictionary exceeds the transport limit');
  const stored=gzipSync(dictionary,{level:9});if(!gunzipSync(stored).equals(dictionary))throw Error('Dictionary gzip round trip failed');
  return{dictionary,stored,files,storedSHA256:sha(stored),dictionarySHA256:sha(dictionary)};
}
