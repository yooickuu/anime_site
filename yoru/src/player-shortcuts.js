export function playerShortcut(event){
 if(event.ctrlKey||event.metaKey||event.altKey||event.repeat||event.isComposing)return null;
 if(event.target?.isContentEditable||event.target?.closest?.('input,textarea,select,[role="combobox"],dialog[open],[role="dialog"]'))return null;
 const physical={KeyF:'fullscreen',KeyM:'mute',KeyT:'cinema'}[event.code];
 if(physical)return physical;
 const key=event.key.toLowerCase();
 if(event.target?.closest?.('button,a')&&[' ','arrowleft','arrowright'].includes(key))return null;
 return {f:'fullscreen',m:'mute',t:'cinema',' ':'play',arrowleft:'back',arrowright:'forward'}[key]||null;
}
