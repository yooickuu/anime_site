// Use the OS-provided PiP window; never replace it with a DOM overlay.
export function webkitPiP(video){return typeof video.webkitSetPresentationMode==='function'&&typeof video.webkitSupportsPresentationMode==='function'&&video.webkitSupportsPresentationMode('picture-in-picture');}
export function supportsPiP(video,doc=document){return webkitPiP(video)||!!(doc.pictureInPictureEnabled&&video.requestPictureInPicture);}
export async function togglePiP(video,doc=document){
 if(webkitPiP(video)){video.webkitSetPresentationMode(video.webkitPresentationMode==='picture-in-picture'?'inline':'picture-in-picture');return;}
 if(doc.pictureInPictureElement)await doc.exitPictureInPicture();
 else if(doc.pictureInPictureEnabled&&video.requestPictureInPicture)await video.requestPictureInPicture();
}
