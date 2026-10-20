import Hls from 'hls.js';

// One transport for the application and the browser playback checks.
export function createPlayback(video, onState = () => {}, {schedule=setTimeout,cancel=clearTimeout,startupTimeout=20000} = {}) {
  let hls = null, generation = 0, events = null, startupTimer;
  function suspend() {
    generation++;
    cancel(startupTimer);startupTimer=null;
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
    let mediaRetries = 0, networkRetries = 0;
    emit('loading');
    startupTimer=schedule(()=>{if(own===generation && video.readyState<2)emit('error');},startupTimeout);
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
    listen('playing', () => emit('playing'));
    listen('waiting', () => emit('buffering'));
    listen('error', () => { if (video.getAttribute('src')) emit('error'); });
    if (stream && Hls.isSupported()) {
      hls = new Hls({ startPosition: startAt > 0 ? startAt : -1, maxBufferLength: 30, maxMaxBufferLength: 60 });
      const transport = hls;
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal || own !== generation) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries++ < 1) {
          transport.recoverMediaError();
        } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries++ < 1 && ![401,403,404,410].includes(data.response?.code)) {
          transport.startLoad();
        } else { transport.stopLoad(); emit('error'); }
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
