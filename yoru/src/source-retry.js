// Resolver failures happen before HLS exists. Keep the loading UI during retries.
export async function retrySourceRequest(load,{current=()=>true,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 for(let attempt=0;attempt<=3;attempt++){
  if(!current())throw Error('stalePlayback');
  try{return await load();}catch(error){
   const transient=error.message==='providerError'||['TypeError','TimeoutError'].includes(error.name);
   if(!current()||!transient||attempt===3)throw error;
   await wait(1500);
  }
 }
}
