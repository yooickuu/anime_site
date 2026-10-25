const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function retryableNetworkError(error){
 return ['TimeoutError','TypeError'].includes(error?.name)||/network|fetch failed|unexpected EOF|connection (?:reset|closed)|http2|timed? ?out|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(error?.message||'');
}
export async function networkRetry(operation,{wait=pause,signal}={}){
 for(let attempt=0;attempt<3;attempt++){
  signal?.throwIfAborted();
  try{return await operation();}catch(error){
   if(signal?.aborted||attempt===2||!retryableNetworkError(error))throw error;
   await wait(1500);
  }
 }
}
