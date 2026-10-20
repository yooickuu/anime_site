export function cropGeometry(width, height, zoom = 1, x = .5, y = .5) {
  const size = Math.min(width, height) / Math.max(1, Math.min(4, zoom));
  return {size, x:Math.min(width-size,Math.max(0,x*width-size/2)),y:Math.min(height-size,Math.max(0,y*height-size/2))};
}
export function bannerGeometry(width,height,zoom=1,x=.5,y=.5){
 const w=Math.min(width,height*3.2)/Math.max(1,Math.min(4,zoom)),h=w/3.2;
 return {width:w,height:h,x:Math.min(width-w,Math.max(0,x*width-w/2)),y:Math.min(height-h,Math.max(0,y*height-h/2))};
}
export function fitImageDimensions(width,height,maxWidth=2560,maxHeight=1600){
 const scale=Math.min(1,maxWidth/width,maxHeight/height);
 return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
export async function cropBanner(file,t){return cropAvatar(file,t,true);}
export async function cropAvatar(file, t, banner=false) {
  const url=URL.createObjectURL(file),img=new Image();
  try {img.src=url;await img.decode();} catch(error) {URL.revokeObjectURL(url);throw error;}
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='avatar-crop-dialog'+(banner?' banner-crop-dialog':'');
    dialog.innerHTML=`<h2>${t(banner?'cropBanner':'cropAvatar')}</h2>${banner?`<div class="banner-fit-options" role="group"><button type="button" class="chip" data-banner-fit="full" aria-pressed="true">${t("bannerFit")}</button><button type="button" class="chip" data-banner-fit="crop" aria-pressed="false">${t("bannerCrop")}</button></div>`:""}<div class="crop-layout"><canvas class="crop-canvas" width="640" height="${banner?200:640}" role="img" aria-label="${t('cropDrag')}" tabindex="0"></canvas><div class="crop-previews"><canvas width="160" height="${banner?50:160}" aria-label="${t('preview')}"></canvas><canvas width="64" height="${banner?20:64}" aria-label="${t('preview')}"></canvas></div></div><label class="crop-zoom">${t('zoom')}<input type="range" min="1" max="4" step="0.01" value="1" aria-label="${t('zoom')}"></label><div class="form-actions"><button type="button" class="button soft" data-crop-cancel>${t('cancel')}</button><button type="button" class="button primary" data-crop-save>${t('save')}</button></div>`;
    document.body.append(dialog);
    const canvas=dialog.querySelector('.crop-canvas'),previews=[...dialog.querySelectorAll('.crop-previews canvas')],slider=dialog.querySelector('input');
    let zoom=1,x=.5,y=.5,drag=null,finished=false,fit=banner;
    const geometry=()=>{if(banner&&fit)return {x:0,y:0,width:img.naturalWidth,height:img.naturalHeight};if(banner)return bannerGeometry(img.naturalWidth,img.naturalHeight,zoom,x,y);const r=cropGeometry(img.naturalWidth,img.naturalHeight,zoom,x,y);return {...r,width:r.size,height:r.size};};
    function draw(){
      const r=geometry();
      // Keep the centre within the actual crop so dragging never leaves a blank edge.
      x=(r.x+r.width/2)/img.naturalWidth;y=(r.y+r.height/2)/img.naturalHeight;
      for(const target of [canvas,...previews]){
        const ctx=target.getContext('2d');ctx.clearRect(0,0,target.width,target.height);
        const scale=fit?Math.min(target.width/r.width,target.height/r.height):null;
        const dw=fit?r.width*scale:target.width,dh=fit?r.height*scale:target.height;
        ctx.drawImage(img,r.x,r.y,r.width,r.height,(target.width-dw)/2,(target.height-dh)/2,dw,dh);
      }
    }
    function finish(blob=null){if(finished)return;finished=true;dialog.close();dialog.remove();URL.revokeObjectURL(url);resolve(blob);}
    canvas.addEventListener('pointerdown',event=>{if(fit)return;drag={x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);});
    canvas.addEventListener('pointermove',event=>{
      if(!drag)return;
      const scale=geometry().width/canvas.getBoundingClientRect().width;
      x-=(event.clientX-drag.x)*scale/img.naturalWidth;y-=(event.clientY-drag.y)*scale/img.naturalHeight;
      drag={x:event.clientX,y:event.clientY};draw();
    });
    for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{drag=null;});
    canvas.addEventListener('keydown',event=>{const steps={ArrowLeft:[-.02,0],ArrowRight:[.02,0],ArrowUp:[0,-.02],ArrowDown:[0,.02]};if(!fit&&steps[event.key]){event.preventDefault();x+=steps[event.key][0];y+=steps[event.key][1];draw();}});
    slider.disabled=fit;
    dialog.querySelectorAll('[data-banner-fit]').forEach(button=>button.addEventListener('click',()=>{fit=button.dataset.bannerFit==='full';zoom=1;slider.value='1';slider.disabled=fit;dialog.querySelectorAll('[data-banner-fit]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.bannerFit==='full')===fit)));draw();}));
    slider.addEventListener('input',()=>{zoom=Number(slider.value);draw();});
    dialog.querySelector('[data-crop-cancel]').addEventListener('click',()=>finish());
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish();});
    dialog.querySelector('[data-crop-save]').addEventListener('click',async()=>{
      dialog.querySelector('[data-crop-save]').disabled=true;
      const out=document.createElement('canvas');const size=fitImageDimensions(geometry().width,geometry().height);out.width=banner?size.width:512;out.height=banner?size.height:512;
      const r=geometry();
      out.getContext('2d').drawImage(img,r.x,r.y,r.width,r.height,0,0,out.width,out.height);
      let blob=await new Promise(resolve=>out.toBlob(resolve,banner?'image/jpeg':'image/png',.92));
      if(banner&&blob?.size>2097152)blob=await new Promise(resolve=>out.toBlob(resolve,'image/jpeg',.82));
      if(banner&&blob?.size>2097152){const smaller=document.createElement('canvas');smaller.width=Math.round(out.width*.75);smaller.height=Math.round(out.height*.75);smaller.getContext('2d').drawImage(out,0,0,smaller.width,smaller.height);blob=await new Promise(resolve=>smaller.toBlob(resolve,'image/jpeg',.82));}
      finish(blob);
    });
    draw();dialog.showModal();canvas.focus();
  });
}
