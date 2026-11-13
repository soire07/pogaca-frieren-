(() => {
 const root=document.querySelector('[data-exploration-atlas]'); if(!root)return;
 const modal=root.querySelector('[data-atlas-modal]'),panels=[...root.querySelectorAll('[data-atlas-panel]')];
 const viewport=root.querySelector('[data-atlas-viewport]'),camera=root.querySelector('[data-atlas-camera]');
 if(!modal||!viewport||!camera)return;
 let last=null,scale=1,x=0,y=0,pointers=new Map(),drag=null,pinchDistance=0;
 const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
 const routePlanner=root.querySelector('[data-atlas-route-planner]');
 const ecologyProfiles={merkez:{spring:'Ilık bozkır ve çiçekli çayırlar',summer:'Kurak çayır ve seyrek çalı',autumn:'Altın otlak ve yaprak döken çalı',winter:'Soğuk bozkır ve donmuş otlak'},orman:{spring:'Nemli yosun, eğrelti ve genç yapraklar',summer:'Yoğun geniş yapraklı orman',autumn:'Kızıl yaprak örtüsü ve mantarlar',winter:'Kar tutmuş iğne yapraklı ağaçlar'},harabeler:{spring:'Yüksek çayır ve taşlık yamaç',summer:'Kuru fundalık ve taşlık arazi',autumn:'Solmuş fundalık ve sarı otlar',winter:'Rüzgârlı, seyrek kar örtülü yayla'},kuzey:{spring:'Soğuk göl kıyısı ve alpin çayır',summer:'Serin göl kıyısı ve alpin çayır',autumn:'Sisli tundra çalılıkları',winter:'Kar ve buzla kaplı tundra'},yayla:{spring:'Kar erimesi ve alpin çayırlar',summer:'Kayalık dağ çayırı',autumn:'Don başlangıcı ve seyrek otlar',winter:'Buzul karı ve çıplak kaya'},aus:{spring:'Kutup-altı seyrek bitki örtüsü',summer:'Kısa yaz tundrası',autumn:'Donmuş tundra ve liken',winter:'Yoğun kar ve buz'}};
 const updateEcology=()=>{const season=root.querySelector('select[data-atlas-season]')?.value||'summer',weather=root.querySelector('select[data-atlas-weather]')?.value||'clear';root.querySelectorAll('[data-atlas-ecology-profile]').forEach(node=>{const key=node.dataset.atlasEcologyProfile,region=ecologyProfiles[key]||ecologyProfiles.merkez;node.textContent=node.textContent.split(':')[0]+': '+region[season]+' · '+({clear:'Açık',mist:'Sisli',snow:'Karlı',rain:'Yağışlı'}[weather]||'Açık');});const mapArt=root.querySelector('.atlas-map-art');if(mapArt){mapArt.dataset.atlasSeason=season;mapArt.dataset.atlasWeather=weather;}};
 const calibrationInput=root.querySelector('[data-atlas-reference-km]');
 try{if(calibrationInput){const saved=localStorage.getItem('frieren-atlas-km-per-100-units-v1');if(saved&&Number(saved)>0)calibrationInput.value=saved;}}catch{}
 routePlanner?.addEventListener('click',event=>{const clearButton=event.target.closest('[data-atlas-route-clear]');if(!clearButton)return;const routeSvg=root.querySelector('.atlas-route-overlay'),summary=routePlanner.querySelector('[data-atlas-route-summary]');if(routeSvg){routeSvg.setAttribute('hidden','');routeSvg.style.display='none';}if(summary)summary.textContent='Rota temizlendi. Yeni bir başlangıç ve varış noktası seç.';});
 const paint=()=>{camera.style.transform='translate3d('+x+'px,'+y+'px,0) scale('+scale+')';const output=root.querySelector('[data-atlas-zoom-value]');if(output)output.value=Math.round(scale*100)+'%';const mapArt=root.querySelector('.atlas-map-art');if(mapArt){const regional=Number(mapArt.dataset.atlasZoomRegional)||1.35,local=Number(mapArt.dataset.atlasZoomLocal)||2.2;mapArt.dataset.atlasZoomDetail=scale>=local?'local':scale>=regional?'regional':'overview';}};
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
  const routeSubmit=event.target.closest('[data-atlas-route-submit]');
  if(routeSubmit){
   const planner=root.querySelector('[data-atlas-route-planner]'),from=planner?.querySelector('[data-atlas-route-from]')?.value,to=planner?.querySelector('[data-atlas-route-to]')?.value,summary=planner?.querySelector('[data-atlas-route-summary]'),routeSvg=root.querySelector('.atlas-route-overlay');
   let routes={};try{routes=JSON.parse(planner?.dataset.atlasRouteCatalog||'{}');}catch{routes={};}
   const route=routes[from+':'+to];if(!route){if(summary)summary.textContent='Bu iki nokta arasında kayıtlı bir yol veya geçit bağlantısı bulunamadı.';if(routeSvg)routeSvg.setAttribute('hidden','');return;}
   const path=route.nodes.map((node,index)=>(index?'L':'M')+(Number(node.x)*18).toFixed(1)+' '+(Number(node.y)*12).toFixed(1)).join(' '),line=routeSvg?.querySelector('[data-atlas-route-path]'),glow=routeSvg?.querySelector('[data-atlas-route-glow]');
   if(line)line.setAttribute('d',path);if(glow)glow.setAttribute('d',path);
   const start=routeSvg?.querySelector('[data-atlas-route-start]'),end=routeSvg?.querySelector('[data-atlas-route-end]'),first=route.nodes[0],lastNode=route.nodes[route.nodes.length-1];
   if(start){start.setAttribute('cx',Number(first.x)*18);start.setAttribute('cy',Number(first.y)*12);}if(end){end.setAttribute('cx',Number(lastNode.x)*18);end.setAttribute('cy',Number(lastNode.y)*12);}
   if(routeSvg){routeSvg.removeAttribute('hidden');routeSvg.style.display='block';}
   const via=route.nodes.slice(1,-1).map(node=>node.label);const scaleKm=Number(calibrationInput?.value),kmEstimate=Number.isFinite(scaleKm)&&scaleKm>0?Number((Number(route.distanceUnits)*scaleKm/100).toFixed(1)):null;if(summary)summary.textContent=route.nodes[0].label+' → '+lastNode.label+' · '+Number(route.distanceUnits).toFixed(1)+' harita birimi'+(kmEstimate!==null?' · yaklaşık '+kmEstimate+' km (senin ölçek kalibrasyonun)':' · kilometre ölçeği kalibre edilmedi')+(via.length?' · Geçitler: '+via.join(' → '):' · Doğrudan bağlantı');
   return;
  }
  const routeClear=event.target.closest('[data-atlas-route-clear]');if(routeClear){const routeSvg=root.querySelector('.atlas-route-overlay'),summary=root.querySelector('[data-atlas-route-summary]');if(routeSvg)routeSvg.setAttribute('hidden','');if(summary)summary.textContent='Rota temizlendi. Yeni bir başlangıç ve varış noktası seç.';return;}
  const lightingButton=event.target.closest('[data-atlas-lighting-toggle]');if(lightingButton){const enabled=lightingButton.getAttribute('aria-pressed')!=='true',mapArt=root.querySelector('.atlas-map-art');lightingButton.setAttribute('aria-pressed',String(enabled));if(mapArt)mapArt.dataset.atlasLighting=enabled?'night':'day';lightingButton.textContent=enabled?'Gündüz görünümü':'Gece görünümü';return;}
  const trigger=event.target.closest('[data-atlas-open]');if(trigger){event.preventDefault();open(trigger.dataset.atlasOpen,trigger.dataset.atlasFocus,trigger.dataset.atlasTargetKey,trigger);}
 });
 root.addEventListener('change',event=>{const weather=event.target.closest('select[data-atlas-weather]'),season=event.target.closest('select[data-atlas-season]'),calibration=event.target.closest('[data-atlas-reference-km]');if(weather||season){updateEcology();return;}if(calibration){const value=Number(calibration.value);try{if(Number.isFinite(value)&&value>0)localStorage.setItem('frieren-atlas-km-per-100-units-v1',String(value));else localStorage.removeItem('frieren-atlas-km-per-100-units-v1');}catch{}return;}});
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
 updateEcology();
 paint();
})();