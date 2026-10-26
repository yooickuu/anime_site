// Read dimensions BEFORE decoding an image, bounding iPhone canvas memory.
export function dimensions(bytes){
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),str=(p,n)=>String.fromCharCode(...bytes.slice(p,p+n));
 if(bytes.length>=24&&d.getUint32(0)===0x89504e47)return [d.getUint32(16),d.getUint32(20)];
 if(bytes[0]===255&&bytes[1]===216){let p=2;while(p+9<bytes.length){if(bytes[p++]!==255)continue;const marker=bytes[p++];if(marker===216||marker===217)continue;const size=d.getUint16(p);if(size<2)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return [d.getUint16(p+5),d.getUint16(p+3)];p+=size;}}
 if(bytes.length>=30&&str(0,4)==='RIFF'&&str(8,4)==='WEBP'){
  const type=str(12,4),u24=p=>bytes[p]+(bytes[p+1]<<8)+(bytes[p+2]<<16);
  if(type==='VP8X')return [1+u24(24),1+u24(27)];
  if(type==='VP8 ')return [d.getUint16(26,true)&16383,d.getUint16(28,true)&16383];
  if(type==='VP8L'){const bits=d.getUint32(21,true);return [1+(bits&16383),1+((bits>>>14)&16383)];}
 }
 throw Error('invalid_image');
}
export function validateImage(file,w,h){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024||w<1||h<1||w*h>12600000||w>12000||h>12000)throw Error('invalid_image');}
export async function uploadImage(ctx,file,{room=null,avatar=false}={}){
 const uid=ctx.user()?.id;if(!uid||ctx.user().is_anonymous)throw Error('login_required');
 const [w,h]=dimensions(new Uint8Array(await file.slice(0,262144).arrayBuffer()));validateImage(file,w,h);
 const scale=Math.min(1,(avatar?512:1600)/Math.max(w,h)),width=Math.round(w*scale),height=Math.round(h*scale);
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 let image,url;
 try{
  if(globalThis.createImageBitmap)image=await createImageBitmap(file,{resizeWidth:width,resizeHeight:height});
  else{url=URL.createObjectURL(file);image=new Image();image.src=url;await image.decode();}
  canvas.getContext('2d').drawImage(image,0,0,width,height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.86));if(!blob||blob.size>3145728)throw Error('invalid_image');
  if(ctx.user()?.id!==uid)throw Error('account_changed');
  const bucket=room?'social-chat-media':'social-profile-media',path=`${room?room+'/':''}${uid}/${crypto.randomUUID()}.webp`;
  const {error}=await ctx.client.storage.from(bucket).upload(path,blob,{contentType:'image/webp',upsert:false});if(error)throw error;
  return path;
 }finally{image?.close?.();if(url)URL.revokeObjectURL(url);canvas.width=1;canvas.height=1;}
}
