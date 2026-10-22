// Preserve episode order while limiting simultaneous network work.
export async function mapLimit(items,limit,work){
 const output=new Array(items.length);let index=0,failure;
 await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
  while(index<items.length&&!failure){const i=index++;try{output[i]=await work(items[i],i);}catch(e){failure=e;}}
 }));
 if(failure)throw failure;return output;
}
