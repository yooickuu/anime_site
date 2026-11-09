export function photoViewer(root,{signal,lang=()=> 'ru',resolve}){
 let dialog,version=0,opener;
 const text=()=>({ru:{open:'Открыть фото',close:'Закрыть фото',loading:'Загрузка…',error:'Не удалось открыть фото. Попробуйте ещё раз.'},en:{open:'Open photo',close:'Close photo',loading:'Loading…',error:'Could not open photo. Please try again.'},ja:{open:'写真を開く',close:'閉じる',loading:'読み込み中…',error:'写真を開けません。再試行してください。'}})[lang()]||{open:'Photo',close:'Close',loading:'Loading…',error:'Could not open photo.'};
 function close(){++version;dialog?.close();dialog?.remove();dialog=null;if(opener?.isConnected)opener.focus({preventScroll:true});}
 async function open(button){close();opener=button;const own=++version,labels=text();dialog=root.ownerDocument.createElement('dialog');dialog.className='social-photo-viewer';dialog.setAttribute('aria-label',labels.open);
 const image=root.ownerDocument.createElement('img');image.alt=button.querySelector('img')?.alt||labels.open;image.decoding='async';const status=root.ownerDocument.createElement('p');status.role='status';status.textContent=labels.loading;
 const dismiss=root.ownerDocument.createElement('button');dismiss.className='social-photo-close';dismiss.textContent='×';dismiss.setAttribute('aria-label',labels.close);dismiss.addEventListener('click',close);dialog.append(dismiss,image,status);root.ownerDocument.body.append(dialog);dialog.showModal();dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
 image.onload=()=>{status.textContent='';};image.onerror=()=>{status.textContent=labels.error;};
 try{const url=await resolve(button.dataset.openPhoto);if(own!==version||signal.aborted)return;if(!url)throw Error('image unavailable');const safe=new URL(url,root.ownerDocument.baseURI);if(!['http:','https:'].includes(safe.protocol))throw Error('invalid image URL');image.src=safe.href;}catch{if(own===version)status.textContent=labels.error;}
 }
 root.addEventListener('click',e=>{const button=e.target.closest('[data-open-photo]');if(button){e.preventDefault();void open(button);}},{signal});signal.addEventListener('abort',close,{once:true});return close;
}
