import {idleControls} from './idle-controls.js';
import {icon} from './icons.js';
import {timeLabel} from './state.js';
export function controlsHTML(t, {speed = 1} = {}) {
  return `<div class="video-controls" role="group" aria-label="${t('videoControls')}"><input class="video-seek" type="range" min="0" max="100" value="0" step="0.1" aria-label="${t('seek')}" disabled><button class="icon-button" data-video="play" aria-label="${t('play')}" title="${t('play')}">${icon('play')}</button><span class="video-time" data-video-time>0:00 / 0:00</span><button class="icon-button" data-video="mute" aria-label="${t('mute')}" title="${t('mute')}">${icon('volume')}</button><input class="video-volume" type="range" min="0" max="1" value="1" step="0.05" aria-label="${t('volume')}"><span class="video-option"><select id="speed" aria-label="${t('speed')}">${[0.5,0.75,1,1.25,1.5,1.75,2].map(v=>`<option value="${v}" ${Number(speed)===v?'selected':''}>${v}×</option>`).join('')}</select></span><span class="video-option" id="quality-control" hidden><select id="quality" aria-label="${t('quality')}"></select></span><span class="video-option" id="subtitle-control">${icon('subtitles')}<select id="subtitle-picker" aria-label="${t('subtitles')}"><option value="off">${t('subtitlesOff')}</option></select></span><button class="icon-button" data-action="cinema" aria-label="${t('cinema')}" title="${t('cinema')}" aria-pressed="false">${icon('screen')}</button><button class="icon-button" data-video="pip" aria-label="${t('pip')}" title="${t('pip')}">${icon('pip')}</button><button class="icon-button" data-video="fullscreen" aria-label="${t('fullscreen')}" title="${t('fullscreen')}">${icon('fullscreen')}</button></div><span class="video-loading" role="status" hidden>${t('loading')}</span>`;
}
export function attachControls(root, video, t, onError, {sound, onSoundChange = () => {}} = {}) {
  if(sound){video.volume=sound.volume;video.muted=sound.muted;}
  let soundTimer;
  const saveSound=()=>{clearTimeout(soundTimer);soundTimer=null;onSoundChange();};
  const soundChanged=()=>{clearTimeout(soundTimer);soundTimer=setTimeout(saveSound,250);};
  video.addEventListener('volumechange',soundChanged);
  const play=root.querySelector('[data-video="play"]'),mute=root.querySelector('[data-video="mute"]');
  const seek=root.querySelector('.video-seek'),volume=root.querySelector('.video-volume'),time=root.querySelector('[data-video-time]');
  const pip=root.querySelector('[data-video="pip"]'),full=root.querySelector('[data-video="fullscreen"]');
  const loading=root.querySelector('.video-loading');
  let dragging=false,lastVolume=video.volume || 1,keyboardFocus=false;
  const idle=idleControls({
    active:()=>root.isConnected&&document.fullscreenElement===root&&!video.paused&&!video.ended,
    blocked:()=>dragging||(keyboardFocus&&!!document.activeElement?.closest('.video-controls'))||!!root.querySelector('[aria-expanded="true"]'),
    show:()=>root.classList.remove('controls-idle'),
    hide:()=>root.classList.add('controls-idle'),
  });
  root.addEventListener('pointermove',()=>{keyboardFocus=false;idle.reveal();});
  root.addEventListener('pointerdown',()=>{keyboardFocus=false;idle.reveal();});
  root.addEventListener('pointerup',()=>idle.reveal());
  root.addEventListener('keydown',()=>{keyboardFocus=true;idle.reveal();});
  root.addEventListener('focusout',()=>{keyboardFocus=false;idle.reveal();});
  root.addEventListener('change',()=>idle.reveal());
  root.addEventListener('fullscreenchange',()=>idle.reveal());
  for(const event of ['play','playing','pause','ended','waiting','seeking','error'])video.addEventListener(event,()=>idle.reveal());
  const togglePlay=()=>{if(!video.currentSrc)return;video.paused?video.play().catch(onError):video.pause();};
  const toggleMute=()=>{if(video.muted || video.volume===0){video.volume=lastVolume || 1;video.muted=false;}else{lastVolume=video.volume;video.muted=true;}};
  const fullscreen=async()=>{
    try {if(document.fullscreenElement)await document.exitFullscreen();else if(root.requestFullscreen)await root.requestFullscreen();else video.webkitEnterFullscreen?.();}catch(error){onError(error);}
  };
  const pictureInPicture=async()=>{
    try {
      if(document.pictureInPictureElement)await document.exitPictureInPicture();
      else if(document.pictureInPictureEnabled && video.requestPictureInPicture)await video.requestPictureInPicture();
      else if(video.webkitSetPresentationMode)video.webkitSetPresentationMode(video.webkitPresentationMode==='picture-in-picture'?'inline':'picture-in-picture');
    }catch(error){onError(error);}
  };
  pip.disabled=!(document.pictureInPictureEnabled && video.requestPictureInPicture || video.webkitSetPresentationMode);
  function update(){
    const duration=Number.isFinite(video.duration)?video.duration:0;
    seek.disabled=!duration;
    seek.max=String(duration||100);
    if(!dragging)seek.value=String(video.currentTime||0);
    seek.setAttribute('aria-valuetext',timeLabel(video.currentTime||0));
    time.textContent=`${timeLabel(video.currentTime||0)} / ${timeLabel(duration)}`;
    seek.style.setProperty('--played',`${duration?video.currentTime/duration*100:0}%`);
    play.innerHTML=icon(video.paused?'play':'pause');
    play.title=t(video.paused?'play':'pause');play.setAttribute('aria-label',play.title);
    const silent=video.muted||video.volume===0;
    mute.innerHTML=icon(silent?'mute':'volume');mute.title=t(silent?'unmute':'mute');
    mute.setAttribute('aria-label',mute.title);mute.setAttribute('aria-pressed',String(silent));
    volume.value=String(silent?0:video.volume);
  }
  play.addEventListener('click',togglePlay);
  // The first tap reveals hidden controls without unexpectedly pausing the episode.
  let touchReveal=false;
  video.addEventListener('pointerdown',event=>{touchReveal=event.pointerType==='touch'&&root.classList.contains('controls-idle');});
  video.addEventListener('click',()=>{if(touchReveal){touchReveal=false;idle.reveal();return;}togglePlay();});
  mute.addEventListener('click',toggleMute);full.addEventListener('click',fullscreen);pip.addEventListener('click',pictureInPicture);
  seek.addEventListener('pointerdown',()=>{dragging=true;});
  seek.addEventListener('pointerup',()=>{dragging=false;});seek.addEventListener('pointercancel',()=>{dragging=false;});
  seek.addEventListener('input',()=>{if(Number.isFinite(video.duration))video.currentTime=Math.min(video.duration,Math.max(0,Number(seek.value)));});
  volume.addEventListener('input',()=>{video.volume=Number(volume.value);if(video.volume>0)lastVolume=video.volume;video.muted=video.volume===0;});
  for(const e of ['loadedmetadata','durationchange','timeupdate','play','pause','ended','volumechange','emptied'])video.addEventListener(e,update);
  for(const e of ['waiting','seeking','loadstart'])video.addEventListener(e,()=>{loading.hidden=false;});
  for(const e of ['canplay','playing','seeked','pause','error','ended'])video.addEventListener(e,()=>{loading.hidden=true;});
  update();
  return ()=>{if(soundTimer)saveSound();video.removeEventListener('volumechange',soundChanged);idle.dispose();};
}
