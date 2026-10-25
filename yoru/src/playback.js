import Hls from 'hls.js';

// One transport for the application and the browser playback checks.
export function createPlayback(video, onState = () => {}, {schedule=setTimeout,cancel=clearTimeout,startupTimeout=95000,HlsClass=Hls} = {}) {
  let hls = null, generation = 0, events = null, startupTimer,retryTimer;
  function suspend() {
    generation++;
    cancel(startupTimer);startupTimer=null;cancel(retryTimer);retryTimer=null;
    events?.abort();
    events = null;
    hls?.stopLoad();
  }
  function stop() {
    suspend();
    hls?.destroy();
    hls = null;
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
  function load({ url, stream = false, autoplay = false, startAt = 0, speed = 1, onState: notify = onState, onMetadata = () => {} }) {
    // Keep the video and its fullscreen container mounted. In particular, native
    // Safari playback must not pass through an empty src between episodes.
    suspend();
    hls?.destroy();
    hls = null;
    const own = generation;
    events = new AbortController();
    const emit = state => { if (own !== generation)return;
      if(['ready','playing','error','unsupported','autoplayBlocked'].includes(state)){cancel(startupTimer);startupTimer=null;}
      notify(state);
    };
    const listen = (name, fn) => video.addEventListener(name, fn, { signal: events.signal });
    let mediaRetries = 0, networkRetries = 0, retryPending=false, failed=false;
    const fail=()=>{if(failed||own!==generation)return;failed=true;cancel(retryTimer);cancel(startupTimer);hls?.stopLoad();emit('error');};
    const armTimeout=()=>{cancel(startupTimer);startupTimer=schedule(()=>{if(own===generation&&video.readyState<2){if(hls)retryNetwork();else fail();}},startupTimeout);};
    const retryNetwork=()=>{
      if(own!==generation||failed||retryPending)return;
      if(networkRetries>=3){fail();return;}
      networkRetries++;retryPending=true;emit('buffering');cancel(startupTimer);
      retryTimer=schedule(()=>{retryTimer=null;retryPending=false;if(own!==generation||failed)return;hls?.startLoad();armTimeout();},1500);
    };
    emit('loading');
    armTimeout();
    listen('loadedmetadata', () => {
      if(!autoplay)emit('ready');
      if (startAt > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(startAt, Math.max(0, video.duration - 0.1));
      video.playbackRate = speed;
      onMetadata();
      if (autoplay) video.play().catch(error => {
        if(error?.name==='AbortError')return;
        emit(error?.name==='NotAllowedError'?'autoplayBlocked':'error');
      });
    });
    listen('canplay', () => emit('ready'));
    listen('playing', () => {networkRetries=0;retryPending=false;cancel(retryTimer);retryTimer=null;emit('playing');});
    listen('waiting', () => emit('buffering'));
    listen('error', () => {if(hls&&video.error?.code===2)retryNetwork();else if(video.getAttribute('src'))fail();});
    if (stream && !video.canPlayType?.('application/vnd.apple.mpegurl') && HlsClass.isSupported()) {
      hls = new HlsClass({ startPosition: startAt > 0 ? startAt : -1, maxBufferLength: 30, maxMaxBufferLength: 60, manifestLoadPolicy:{default:{...HlsClass.DefaultConfig.manifestLoadPolicy.default,maxTimeToFirstByteMs:85000,maxLoadTimeMs:90000}},fragLoadPolicy:{default:{...HlsClass.DefaultConfig.fragLoadPolicy.default,maxTimeToFirstByteMs:85000,maxLoadTimeMs:90000}},playlistLoadPolicy:{default:{...HlsClass.DefaultConfig.playlistLoadPolicy.default,maxTimeToFirstByteMs:85000,maxLoadTimeMs:90000}} });
      const transport = hls;
      hls.on(HlsClass.Events.ERROR, (_, data) => {
        if (!data.fatal || own !== generation) return;
        if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR && mediaRetries++ < 1) {
          transport.recoverMediaError();
        } else if (data.type === HlsClass.ErrorTypes.NETWORK_ERROR && ![401,403,404,410].includes(data.response?.code)) {
          retryNetwork();
        } else { fail(); }
      });
      hls.loadSource(url);
      hls.attachMedia(video);
    } else if (!stream || video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.load();
    } else emit('unsupported');
  }
  return { load, suspend, destroy: stop };
}
