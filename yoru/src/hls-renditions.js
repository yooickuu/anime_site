// I-FRAME playlists contain seek thumbnails/keyframes, not watchable renditions.
// Parsing a master only discovers candidates; decoded/browser probes are separate.
export function hlsRenditions(text,baseURL){
 if(!String(text).trimStart().startsWith('#EXTM3U'))return [];
 const lines=String(text).split(/\r?\n/).map(s=>s.trim()),out=[];
 for(let i=0;i<lines.length;i++){
  if(!lines[i].startsWith('#EXT-X-STREAM-INF:'))continue;
  const size=lines[i].match(/(?:[:,])RESOLUTION=(\d+)x(\d+)(?:,|$)/);
  if(!size)continue;
  let next=i+1;while(next<lines.length&&!lines[next])next++;
  if(!lines[next]||lines[next].startsWith('#'))continue;
  try{
   const url=new URL(lines[next],baseURL);
   if(url.protocol!=='https:')continue;
   const width=Number(size[1]),height=Number(size[2]);
   if(width>0&&height>0)out.push({width,height,quality:height,url:url.href});
  }catch{}
 }
 return out;
}
