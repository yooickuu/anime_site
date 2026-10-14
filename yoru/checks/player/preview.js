import {controlsHTML,attachControls} from '../../src/player-controls.js';
import {createPlayback} from '../../src/playback.js';
import {initSelectMenus,enhanceSelects} from '../../src/select-menu.js';
import {fetchRelease,providerEpisode,chooseQuality} from '../../src/provider.js';
import {cropAvatar} from '../../src/avatar-crop.js';
import {dictionaries} from '../../src/i18n.js';
const t=k=>dictionaries.ru[k]||k;
const video=document.querySelector('video'),shell=document.querySelector('.video-shell'),status=document.querySelector('#status');
document.querySelector('#controls').outerHTML=controlsHTML(t);
attachControls(shell,video,t,error=>{status.textContent='Ошибка: '+error.name;});
const transport=createPlayback(video,state=>{status.textContent='Состояние: '+state;});
initSelectMenus();
let sources=[];
document.querySelector('#real-hls').addEventListener('click',async()=>{
 try{
  status.textContent='Получение серии…';
  const chosen=document.querySelector('#test-title').value;
  const release=chosen==='vost'?null:await fetchRelease('lib-'+chosen);
  const info=release?await providerEpisode(release.id,1):{sources:[{quality:720,url:'https://video.animetop.info/720/987920353.mp4'},{quality:480,url:'https://video.animetop.info/987920353.mp4'}]};
  sources=info.sources;
  document.querySelector('#quality-control').hidden=false;
  document.querySelector('#quality').innerHTML=sources.map(s=>`<option value="${s.quality}" ${s.quality===720?'selected':''}>${s.quality}p</option>`).join('');
  enhanceSelects();
  video.muted=true;
  transport.load({url:chooseQuality(sources).url,stream:chooseQuality(sources).url.includes('.m3u8'),autoplay:true});
 }catch(error){status.textContent='Ошибка: '+error.message;}
});
document.addEventListener('change',event=>{
 if(event.target.id==='speed')video.playbackRate=Number(event.target.value);
 if(event.target.id==='quality')transport.load({url:chooseQuality(sources,Number(event.target.value)).url,stream:chooseQuality(sources).url.includes('.m3u8'),autoplay:!video.paused,startAt:video.currentTime,speed:video.playbackRate});
 if(event.target.id==='crop-file')cropAvatar(event.target.files[0],t).then(blob=>{if(blob){document.querySelector('#crop-result').src=URL.createObjectURL(blob);}});
});
document.querySelector('[data-action="cinema"]').addEventListener('click',()=>{document.querySelector('main').classList.toggle('wide');});

document.querySelector('#crop-preset').addEventListener('click',async()=>{const r=await fetch('sintel.png');const blob=await cropAvatar(await r.blob(),t);if(blob){document.querySelector('#crop-result').src=URL.createObjectURL(blob);status.textContent='Обрезка сохранена: '+blob.size+' байт';}});
