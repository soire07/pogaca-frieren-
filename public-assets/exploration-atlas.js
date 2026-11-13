(() => {
 const root=document.querySelector('[data-exploration-atlas]'); if(!root)return;
 const modal=root.querySelector('[data-atlas-modal]'),panels=[...root.querySelectorAll('[data-atlas-panel]')];
 const viewport=root.querySelector('[data-atlas-viewport]'),camera=root.querySelector('[data-atlas-camera]');
 if(!modal||!viewport||!camera)return;
 let last=null,scale=1,x=0,y=0,pointers=new Map(),drag=null,pinchDistance=0;
 const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
 const paint=()=>{camera.style.transform='translate3d('+x+'px,'+y+'px,0) scale('+scale+')';const output=root.querySelector('[data-atlas-zoom-value]');if(output)output.value=Math.round(scale*100)+'%';};
 const bounds=()=>{const rect=viewport.getBoundingClientRect();return {x:Math.max(0,(rect.width*(scale-1))/2),y:Math.max(0,(rect.height*(scale-1))/2)};};
 const constrain=()=>{const limit=bounds();x=clamp(x,-limit.x,limit.x);y=clamp(y,-limit.y,limit.y);};
 const zoom=delta=>{scale=clamp(scale*delta,.85,3.2);constrain();paint();};
 const reset=()=>{scale=1;x=0;y=0;paint();};
 const close=()=>{modal.hidden=true;document.body.classList.remove('atlas-modal-open');if(last)last.focus();};
 const open=(key,focus,targetKey,trigger)=>{const active=panels.find(item=>item.dataset.atlasPanel===key);if(!active)return;panels.forEach(item=>{item.hidden=item!==active;item.querySelectorAll('.is-highlighted').forEach(node=>node.classList.remove('is-highlighted'));});modal.hidden=false;document.body.classList.add('atlas-modal-open');last=trigger;const heading=active.querySelector('h3');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}if(focus!=='region'){const target=[...active.querySelectorAll('[data-atlas-focus-target="'+focus+'"]')].find(node=>node.dataset.atlasTargetKey===targetKey);if(target)target.classList.add('is-highlighted');}};
 root.addEventListener('click',event=>{
  const closeButton=event.target.closest('[data-atlas-close]');if(closeButton){close();return;}
  const zoomButton=event.target.closest('[data-atlas-zoom]');if(zoomButton){zoom(Number(zoomButton.dataset.atlasZoom)>0?1.25:.8);return;}
  if(event.target.closest('[data-atlas-reset]')){reset();return;}
  const layerButton=event.target.closest('[data-atlas-layer]');if(layerButton){const layer=layerButton.dataset.atlasLayer,enabled=layerButton.getAttribute('aria-pressed')!=='true';layerButton.setAttribute('aria-pressed',String(enabled));root.querySelectorAll('[data-atlas-layer-item="'+layer+'"]').forEach(pin=>{pin.hidden=!enabled;});return;}
  const geographyButton=event.target.closest('[data-atlas-geography]');
  if(geographyButton){const layer=geographyButton.dataset.atlasGeography,enabled=geographyButton.getAttribute('aria-pressed')!=='true';geographyButton.setAttribute('aria-pressed',String(enabled));root.querySelectorAll('[data-atlas-geography-layer="'+layer+'"]').forEach(node=>node.toggleAttribute('hidden',!enabled));return;}
  const trigger=event.target.closest('[data-atlas-open]');if(trigger){event.preventDefault();open(trigger.dataset.atlasOpen,trigger.dataset.atlasFocus,trigger.dataset.atlasTargetKey,trigger);}
 });
 viewport.addEventListener('wheel',event=>{event.preventDefault();zoom(event.deltaY<0?1.12:.89);},{passive:false});
 viewport.addEventListener('pointerdown',event=>{
  if(event.target.closest('button'))return;
  viewport.setPointerCapture?.(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(pointers.size===1)drag={x:event.clientX,y:event.clientY,originX:x,originY:y};
  if(pointers.size===2){const points=[...pointers.values()];pinchDistance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);drag=null;}
 });
 viewport.addEventListener('pointermove',event=>{
  if(!pointers.has(event.pointerId))return;
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(pointers.size===2){const points=[...pointers.values()],distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);if(pinchDistance>0&&distance>0){scale=clamp(scale*(distance/pinchDistance),.85,3.2);pinchDistance=distance;constrain();paint();}return;}
  if(drag){x=drag.originX+(event.clientX-drag.x);y=drag.originY+(event.clientY-drag.y);constrain();paint();}
 });
 const release=event=>{pointers.delete(event.pointerId);if(pointers.size<2)pinchDistance=0;if(!pointers.size)drag=null;};
 viewport.addEventListener('pointerup',release);viewport.addEventListener('pointercancel',release);viewport.addEventListener('lostpointercapture',release);
 viewport.addEventListener('keydown',event=>{if(event.target!==viewport)return;if(event.key==='+'||event.key==='='){event.preventDefault();zoom(1.25);}else if(event.key==='-'){event.preventDefault();zoom(.8);}else if(event.key==='0'){event.preventDefault();reset();}});
 document.addEventListener('keydown',event=>{if(modal.hidden)return;if(event.key==='Escape'){close();return;}if(event.key==='Tab'){const focusable=[...modal.querySelectorAll('button:not([disabled])')];if(!focusable.length)return;const first=focusable[0],lastItem=focusable[focusable.length-1],heading=modal.querySelector('.atlas-hero h3');if(event.shiftKey&&(document.activeElement===first||document.activeElement===heading)){event.preventDefault();lastItem.focus();}else if(!event.shiftKey&&(document.activeElement===lastItem||document.activeElement===heading)){event.preventDefault();first.focus();}}});
 paint();
})();