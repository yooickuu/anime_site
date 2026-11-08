// Reorder only the room panel. Video, selectors and their listeners stay mounted.
export function placeRoomPanel(mount,active){
 const parent=mount?.parentElement;if(!parent?.classList.contains('watch-main'))return;
 const anchor=active?parent.querySelector('.season-tabs'):parent.querySelector('.episode-nav')?.nextElementSibling;
 if(anchor&&anchor!==mount)parent.insertBefore(mount,anchor);
}
