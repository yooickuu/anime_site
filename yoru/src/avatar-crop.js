export function cropGeometry(width, height, zoom = 1, x = .5, y = .5) {
  const size = Math.min(width, height) / Math.max(1, Math.min(4, zoom));
  return {size, x:Math.min(width-size,Math.max(0,x*width-size/2)),y:Math.min(height-size,Math.max(0,y*height-size/2))};
}
export function bannerGeometry(width,height,zoom=1,x=.5,y=.5){
 const w=Math.min(width,height*3.2)/Math.max(1,Math.min(4,zoom)),h=w/3.2;
 return {width:w,height:h,x:Math.min(width-w,Math.max(0,x*width-w/2)),y:Math.min(height-h,Math.max(0,y*height-h/2))};
}
export async function cropBanner(file,t){return cropAvatar(file,t,true);}
export async function cropAvatar(file, t, banner=false) {
  const url=URL.createObjectURL(file),img=new Image();
  try {img.src=url;await img.decode();} catch(error) {URL.revokeObjectURL(url);throw error;}
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='avatar-crop-dialog'+(banner?' banner-crop-dialog':'');
    dialog.innerHTML=`<h2>${t(banner?'cropBanner':'cropAvatar')}</h2><div class="crop-layout"><canvas class="crop-canvas" width="640" height="${banner?200:640}" role="img" aria-label="${t('cropDrag')}" tabindex="0"></canvas><div class="crop-previews"><canvas width="160" height="${banner?50:160}" aria-label="${t('preview')}"></canvas><canvas width="64" height="${banner?20:64}" aria-label="${t('preview')}"></canvas></div></div><label class="crop-zoom">${t('zoom')}<input type="range" min="1" max="4" step="0.01" value="1" aria-label="${t('zoom')}"></label><div class="form-actions"><button type="button" class="button soft" data-crop-cancel>${t('cancel')}</button><button type="button" class="button primary" data-crop-save>${t('save')}</button></div>`;
    document.body.append(dialog);
    const canvas=dialog.querySelector('.crop-canvas'),previews=[...dialog.querySelectorAll('.crop-previews canvas')],slider=dialog.querySelector('input');
    let zoom=1,x=.5,y=.5,drag=null,finished=false;
    const geometry=()=>{if(banner)return bannerGeometry(img.naturalWidth,img.naturalHeight,zoom,x,y);const r=cropGeometry(img.naturalWidth,img.naturalHeight,zoom,x,y);return {...r,width:r.size,height:r.size};};
    function draw(){
      const r=geometry();
      // Keep the centre within the actual crop so dragging never leaves a blank edge.
      x=(r.x+r.width/2)/img.naturalWidth;y=(r.y+r.height/2)/img.naturalHeight;
      for(const target of [canvas,...previews]){
        const ctx=target.getContext('2d');ctx.clearRect(0,0,target.width,target.height);
        ctx.drawImage(img,r.x,r.y,r.width,r.height,0,0,target.width,target.height);
      }
    }
    function finish(blob=null){if(finished)return;finished=true;dialog.close();dialog.remove();URL.revokeObjectURL(url);resolve(blob);}
    canvas.addEventListener('pointerdown',event=>{drag={x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);});
    canvas.addEventListener('pointermove',event=>{
      if(!drag)return;
      const scale=geometry().width/canvas.getBoundingClientRect().width;
      x-=(event.clientX-drag.x)*scale/img.naturalWidth;y-=(event.clientY-drag.y)*scale/img.naturalHeight;
      drag={x:event.clientX,y:event.clientY};draw();
    });
    for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{drag=null;});
    canvas.addEventListener('keydown',event=>{const steps={ArrowLeft:[-.02,0],ArrowRight:[.02,0],ArrowUp:[0,-.02],ArrowDown:[0,.02]};if(steps[event.key]){event.preventDefault();x+=steps[event.key][0];y+=steps[event.key][1];draw();}});
    slider.addEventListener('input',()=>{zoom=Number(slider.value);draw();});
    dialog.querySelector('[data-crop-cancel]').addEventListener('click',()=>finish());
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish();});
    dialog.querySelector('[data-crop-save]').addEventListener('click',()=>{
      const out=document.createElement('canvas');out.width=banner?Math.min(1920,Math.round(geometry().width)):512;out.height=banner?Math.round(out.width/3.2):512;
      const r=geometry();
      out.getContext('2d').drawImage(img,r.x,r.y,r.width,r.height,0,0,out.width,out.height);
      out.toBlob(blob=>finish(blob),banner?'image/jpeg':'image/png',.92);
    });
    draw();dialog.showModal();canvas.focus();
  });
}
