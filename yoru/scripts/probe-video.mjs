// Read a small media prefix. Some CDNs reject HEAD but accept actual playback GETs.
export async function probeVideo(url, request=fetch) {
  if(!url)return 'no_stream';
  try {
    const response=await request(url,{headers:{Range:'bytes=0-1023'},signal:AbortSignal.timeout(12000)});
    const reader=response.body?.getReader();
    try {
      if(!response.ok)return 'http_'+response.status;
      const chunk=reader?await reader.read():{value:null};
      const bytes=chunk.value;
      if(!bytes?.length)return 'empty';
      const header=new TextDecoder().decode(bytes.slice(0,64));
      // MP4 containers begin with an ISO BMFF box, including ftyp/moov/mdat.
      const box=header.slice(4,8);
      return ['ftyp','moov','mdat','styp','free'].includes(box)?'ok':'not_video';
    } finally {await reader?.cancel().catch(()=>{});}
  }catch(error){return error.name==='TimeoutError'?'timeout':'network_error';}
}
