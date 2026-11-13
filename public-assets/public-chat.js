(() => {
 const root=document.querySelector('[data-public-chat]');
 if(!root)return;
 const list=root.querySelector('[data-chat-messages]');
 const form=root.querySelector('[data-chat-form]');
 const feedback=root.querySelector('[data-chat-feedback]');
 const blockedRoot=root.querySelector('[data-chat-blocks]');
 const search=root.querySelector('[data-chat-search]');
 const count=root.querySelector('[data-chat-count]');
 const older=root.querySelector('[data-chat-load-older]');
 const newMessagesButton=root.querySelector('[data-chat-new-messages]');
 const counter=root.querySelector('[data-chat-counter]');
 const isOwner=root.dataset.chatOwner==='true';const pauseButton=root.querySelector('[data-chat-toggle-pause]');const controlStatus=root.querySelector('[data-chat-control-status]');const reportsRoot=root.querySelector('[data-chat-reports]');const reportsRefresh=root.querySelector('[data-chat-reports-refresh]');let chatPaused=false;
 const replyPreview=root.querySelector('[data-chat-reply-preview]');
 const replyLabel=root.querySelector('[data-chat-reply-label]');
 let replyTarget=null;
 const say=message=>{if(feedback)feedback.textContent=message;};
 const uploadMedia=async(file,scope,target,csrf,status)=>{
  if(status)status.textContent='Dosya güvenli depolamaya yükleniyor…';
  const response=await fetch('/api/chat-media/upload',{method:'POST',headers:{'Content-Type':file.type,'X-CSRF-Token':csrf,'X-Chat-Scope':scope,'X-Chat-Target':target||''},body:file});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.status!=='uploaded'){
   const message=data.error==='media_storage_not_configured'?'Dosya deposu henüz etkinleştirilmedi. Owner tarafında R2 ayarları gerekli.':data.error==='media_daily_quota'?'24 saatlik dosya yükleme kotan doldu.':data.error==='media_storage_quota'?'Sohbet dosyaları için ayrılan ücretsiz depolama alanı doldu.':data.error==='media_size_invalid'||data.error==='media_too_large'?'Dosya boyutu izin verilen sınırı aşıyor.':data.error==='media_type_invalid'?'Dosyanın gerçek biçimi desteklenmiyor.':'Dosya yüklenemedi. Tekrar dene.';
   throw new Error(message);
  }
  if(status)status.textContent='Dosya yüklendi.';
  return data.mediaId;
 };
 const discardMedia=async(mediaId,csrf)=>{if(!mediaId)return;try{await fetch('/api/chat-media/discard',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,mediaId})});}catch{}};
 const appendMedia=(parent,item)=>{
  const url=String(item.media_url||''),mime=String(item.media_mime_type||'');
  if(!url||!mime)return;
  let parsed;try{parsed=new URL(url);}catch{return;}
  if(parsed.protocol!=='https:'||!/^([a-f0-9]{32})\.r2\.cloudflarestorage\.com$/i.test(parsed.hostname))return;
  let element;
  if(mime.startsWith('image/')){element=document.createElement('img');element.alt='Sohbette paylaşılan görsel';element.loading='lazy';}
  else if(mime.startsWith('video/')){element=document.createElement('video');element.controls=true;element.preload='metadata';element.playsInline=true;}
  else if(mime.startsWith('audio/')){element=document.createElement('audio');element.controls=true;element.preload='metadata';}
  else return;
  element.className='public-chat-media';element.src=url;element.addEventListener('error',()=>{element.replaceWith(document.createTextNode('Paylaşılan dosya şu anda açılamıyor.'));},{once:true});parent.append(element);
 };


 const askChatDialog=({title,message,value='',multiline=false,confirmOnly=false,confirmLabel='Onayla'})=>new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='public-chat-dialog';
  const panel=document.createElement('form');panel.method='dialog';const heading=document.createElement('h3');heading.textContent=title;const description=document.createElement('p');description.textContent=message;panel.append(heading,description);
  let control=null;if(!confirmOnly){control=document.createElement(multiline?'textarea':'input');control.value=value;control.maxLength=500;control.setAttribute('aria-label',title);panel.append(control);}
  const actions=document.createElement('div');actions.className='public-chat-dialog-actions';const cancel=document.createElement('button');cancel.type='button';cancel.className='public-chat-action';cancel.textContent='Vazgeç';cancel.addEventListener('click',()=>dialog.close('cancel'));const confirm=document.createElement('button');confirm.type='submit';confirm.className='btn';confirm.value='confirm';confirm.textContent=confirmLabel;actions.append(cancel,confirm);panel.append(actions);panel.addEventListener('submit',event=>{event.preventDefault();dialog.close('confirm');});dialog.append(panel);
  dialog.addEventListener('close',()=>{resolve(dialog.returnValue==='confirm'?(confirmOnly?true:control.value):null);dialog.remove();},{once:true});
  root.append(dialog);if(typeof dialog.showModal==='function'){dialog.showModal();control?.focus();}else{dialog.remove();resolve(null);say('Bu tarayıcı güvenli iletişim pencerelerini desteklemiyor.');}
 });
 const askChatReport=()=>new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='public-chat-dialog';const panel=document.createElement('form');panel.method='dialog';const heading=document.createElement('h3');heading.textContent='Mesajı bildir';const description=document.createElement('p');description.textContent='Bildirim nedenini seç ve istersen kısa bir açıklama ekle.';const select=document.createElement('select');select.setAttribute('aria-label','Bildirim nedeni');for(const [value,label] of [['spam','Spam'],['harassment','Taciz'],['inappropriate','Uygunsuz içerik'],['other','Diğer']]){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}const details=document.createElement('textarea');details.maxLength=500;details.placeholder='Ek açıklama (isteğe bağlı)';details.setAttribute('aria-label','Ek açıklama');const actions=document.createElement('div');actions.className='public-chat-dialog-actions';const cancel=document.createElement('button');cancel.type='button';cancel.className='public-chat-action';cancel.textContent='Vazgeç';cancel.addEventListener('click',()=>dialog.close('cancel'));const submit=document.createElement('button');submit.type='submit';submit.className='btn';submit.textContent='Bildir';actions.append(cancel,submit);panel.append(heading,description,select,details,actions);panel.addEventListener('submit',event=>{event.preventDefault();dialog.close('confirm');});dialog.append(panel);dialog.addEventListener('close',()=>{resolve(dialog.returnValue==='confirm'?{reason:select.value,details:details.value}:null);dialog.remove();},{once:true});root.append(dialog);if(typeof dialog.showModal==='function')dialog.showModal();else{dialog.remove();resolve(null);say('Bu tarayıcı güvenli iletişim pencerelerini desteklemiyor.');}
 });

 let refreshing=false;
 let readObserver=null;
 const observedReadIds=new Set();
 const renderBlocked=items=>{
  if(!blockedRoot||!form)return;
  blockedRoot.replaceChildren();
  if(!items.length)return;
  const title=document.createElement('strong');title.textContent='Engellediklerin';blockedRoot.append(title);
  for(const item of items){
   const row=document.createElement('div');row.className='public-chat-blocked-item';
   const name=document.createElement('span');name.textContent=item.blocked_username||'Kullanıcı';
   const button=document.createElement('button');button.type='button';button.className='public-chat-action';button.textContent='Engeli kaldır';button.dataset.chatUnblock=item.blocked_account_id;
   row.append(name,button);blockedRoot.append(row);
  }
 };
 const render=(messages,{preserveScroll=false}={})=>{
  const previousHeight=list.scrollHeight,previousTop=list.scrollTop;
  const nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<72;
  const query=String(search?.value||'').trim().toLocaleLowerCase('tr-TR');
  const visible=query?messages.filter(item=>(String(item.username||'')+' '+String(item.body||'')).toLocaleLowerCase('tr-TR').includes(query)):messages;
  if(count)count.textContent=query?visible.length+' / '+messages.length+' eşleşme':messages.length+' mesaj gösteriliyor';
  const fragment=document.createDocumentFragment();
  for(const item of visible){
   const li=document.createElement('li');li.className='public-chat-message';li.dataset.chatMessageId=String(item.message_id||'');
   const avatarUrl=String(item.avatar_url||'');let trustedDiscordAvatar=false;try{const parsedAvatar=new URL(avatarUrl);trustedDiscordAvatar=parsedAvatar.protocol==='https:'&&parsedAvatar.hostname==='cdn.discordapp.com'&&parsedAvatar.searchParams.get('size')==='128'&&(parsedAvatar.pathname.startsWith('/embed/avatars/')||parsedAvatar.pathname.startsWith('/avatars/'));}catch{}const localAvatar=avatarUrl.startsWith('/profil/media/public?accountId=site_')&&/^[0-9a-f-]{36}$/i.test(avatarUrl.split('accountId=')[1]||'');const avatar=document.createElement(localAvatar||trustedDiscordAvatar?'img':'span');avatar.className='public-chat-avatar';if(item.is_online){avatar.dataset.online='true';avatar.title='Çevrimiçi';}else{avatar.dataset.online='false';avatar.title='Çevrimdışı';}if(avatar.tagName==='IMG'){avatar.alt='';avatar.loading='lazy';avatar.onerror=()=>{const fallback=document.createElement('span');fallback.className='public-chat-avatar';fallback.textContent=Array.from(String(item.username||'G').trim())[0]?.toLocaleUpperCase('tr-TR')||'G';fallback.dataset.online=avatar.dataset.online;fallback.title=avatar.title;avatar.replaceWith(fallback);};avatar.src=avatarUrl;}else avatar.textContent=Array.from(String(item.username||'G').trim())[0]?.toLocaleUpperCase('tr-TR')||'G';
   const body=document.createElement('div');body.className='public-chat-message-body';
   const meta=document.createElement('div');meta.className='public-chat-message-meta';
   const name=document.createElement('strong');name.textContent=String(item.username||'Gezgin');if(/^site_[0-9a-f-]{36}$/i.test(String(item.account_id||''))){const profileLink=document.createElement('a');profileLink.href='/u/'+encodeURIComponent(item.profile_slug||item.account_id);profileLink.textContent=name.textContent;profileLink.className='public-chat-profile-link';name.replaceWith(profileLink);}
   const time=document.createElement('time');const date=new Date(item.created_at);time.dateTime=Number.isNaN(date.getTime())?'':date.toISOString();time.textContent=Number.isNaN(date.getTime())?'':date.toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'})+(item.edited_at?' · düzenlendi':'');
   const ownerBadge=item.is_owner===true?document.createElement('span'):null;if(ownerBadge){ownerBadge.className='public-chat-owner-badge';ownerBadge.textContent='OWNER';ownerBadge.setAttribute('aria-label','Site sahibi');}meta.append(name);if(ownerBadge)meta.append(ownerBadge);meta.append(time);body.append(meta);if(item.pinned_at){const pinned=document.createElement('span');pinned.className='public-chat-pinned';pinned.textContent='✦ Sabitlendi';body.append(pinned);}if(item.is_own&&Number(item.read_count)>0){const read=document.createElement('small');read.className='public-chat-read-count';read.textContent='Okundu · '+Number(item.read_count);body.append(read);}
   if(item.reply){const quote=document.createElement('blockquote');quote.className='public-chat-reply-quote';const qName=document.createElement('strong');qName.textContent=String(item.reply.username||'Yanıtlanan mesaj');const qText=document.createElement('span');qText.textContent=String(item.reply.body||'');quote.append(qName,qText);body.append(quote);}
   const text=document.createElement('p');text.className='public-chat-message-text';text.textContent=item.deleted_at?'Bu mesaj silindi':String(item.body||'');if(item.deleted_at)text.classList.add('is-deleted');body.append(text);appendMedia(body,item);
   const actions=document.createElement('div');actions.className='public-chat-actions';
   if(form&&!item.is_own){const reply=document.createElement('button');reply.type='button';reply.className='public-chat-action';reply.textContent='Yanıtla';reply.dataset.chatReply=item.message_id;actions.append(reply);}
   if(form&&item.is_own&&!item.deleted_at){const edit=document.createElement('button');edit.type='button';edit.className='public-chat-action';edit.textContent='Düzenle';edit.dataset.chatEdit=item.message_id;actions.append(edit);const removeOwn=document.createElement('button');removeOwn.type='button';removeOwn.className='public-chat-action';removeOwn.textContent='Sil';removeOwn.dataset.chatDeleteOwn=item.message_id;actions.append(removeOwn);}if(isOwner&&!item.deleted_at){const remove=document.createElement('button');remove.type='button';remove.className='public-chat-action';remove.textContent='Sil';remove.dataset.chatDelete=item.message_id;actions.append(remove);const pin=document.createElement('button');pin.type='button';pin.className='public-chat-action';pin.textContent=item.pinned_at?'Sabitlemeyi kaldır':'Sabitle';pin.dataset.chatPin=item.message_id;actions.append(pin);}
   if(!item.deleted_at)for(const emoji of ["❤️","✨","😂","😍","🥰","😭","👀","🎉","🙌","💜","🍪","🌸"]){
    const reaction=(Array.isArray(item.reactions)?item.reactions:[]).find(x=>x.emoji===emoji);
    const button=document.createElement('button');button.type='button';button.className='public-chat-reaction';button.textContent=emoji+' '+(reaction?.count||0);button.setAttribute('aria-pressed',String(Boolean(reaction?.reacted)));button.dataset.chatReact=item.message_id;button.dataset.emoji=emoji;
    if(form)actions.append(button);
   }
   if(form&&!item.is_own){const report=document.createElement('button');report.type='button';report.className='public-chat-action';report.textContent='Bildir';report.dataset.chatReport=item.message_id;actions.append(report);const block=document.createElement('button');block.type='button';block.className='public-chat-action';block.textContent='Engelle';block.dataset.chatBlock=item.message_id;actions.append(block);}
   if(actions.children.length)body.append(actions);
   if(/^site_[0-9a-f-]{36}$/i.test(String(item.account_id||''))){const profileLink=document.createElement('a');profileLink.href='/u/'+encodeURIComponent(item.profile_slug||item.account_id);profileLink.className='public-chat-avatar-link';profileLink.setAttribute('aria-label',String(item.username||'Gezgin')+' profilini aç');profileLink.title='Profili aç';profileLink.append(avatar);li.append(profileLink,body);}else li.append(avatar,body);fragment.append(li);
  }
  list.replaceChildren(fragment);
  if(!visible.length){const empty=document.createElement('li');empty.className='public-chat-empty';empty.textContent=query?'Bu aramayla eşleşen mesaj bulunamadı.':'Henüz mesaj yok. İlk selamı sen verebilirsin.';list.append(empty);}
  else if(nearBottom)list.scrollTop=list.scrollHeight;
  else if(preserveScroll)list.scrollTop=previousTop+(list.scrollHeight-previousHeight);
  if(readObserver){readObserver.disconnect();list.querySelectorAll('li[data-chat-message-id]').forEach(node=>readObserver.observe(node));}
 };
 const postAction=async(path,values)=>{
  if(!form)return false;
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:form.elements.csrf.value,...values})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error==='owner_only'?'Bu işlem yalnızca Owner tarafından yapılabilir.':data.error==='chat_paused'?'Sohbet şu anda Owner tarafından durduruldu.':data.error==='invalid_chat_action'?'Bu işlem şu anda yapılamıyor.':'İşlem tamamlanamadı.');
  return data;
 };
 readObserver=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
  const visible=entries.filter(entry=>entry.isIntersecting&&entry.intersectionRatio>=0.6).map(entry=>entry.target.dataset.chatMessageId).filter(id=>id&&!observedReadIds.has(id));
  if(!visible.length||!form)return;
  visible.forEach(id=>observedReadIds.add(id));
  postAction('/api/public-chat/read',{messageIds:JSON.stringify(visible.slice(0,100))}).catch(()=>visible.forEach(id=>observedReadIds.delete(id)));
 },{root:list,threshold:0.6}):null;
 const renderReports=items=>{
  if(!reportsRoot)return;reportsRoot.replaceChildren();reportsRoot.hidden=false;
  const heading=document.createElement('strong');heading.textContent='Sohbet bildirimleri · '+items.length;reportsRoot.append(heading);
  if(!items.length){const empty=document.createElement('p');empty.textContent='Bekleyen bildirim yok.';reportsRoot.append(empty);return;}
  for(const item of items){
   const card=document.createElement('article');card.className='public-chat-report-item';
   const title=document.createElement('strong');title.textContent=(item.reason||'other')+' · '+(item.reporter_name||'Kullanıcı');card.append(title);
   const message=document.createElement('p');message.textContent=(item.author_name||'Kullanıcı')+': '+(item.message_body||'');card.append(message);
   if(item.details){const detail=document.createElement('small');detail.textContent='Açıklama: '+item.details;card.append(detail);}
   const actions=document.createElement('div');actions.className='public-chat-actions';
   for(const [status,label] of [['reviewed','İncelendi'],['dismissed','Reddet']]){const button=document.createElement('button');button.type='button';button.className='public-chat-action';button.textContent=label;button.dataset.chatReportResolve=item.report_id;button.dataset.status=status;actions.append(button);}
   card.append(actions);reportsRoot.append(card);
  }
 };
 const loadReports=async()=>{
  if(!isOwner||!reportsRoot)return;
  if(reportsRefresh)reportsRefresh.disabled=true;
  try{const response=await fetch('/api/public-chat/reports?status=pending',{headers:{accept:'application/json'},cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error==='owner_only'?'Owner yetkisi doğrulanamadı.':'Bildirimler yüklenemedi.');renderReports(Array.isArray(data.reports)?data.reports:[]);}
  catch(error){say(error.message||'Bildirimler yüklenemedi.');}
  finally{if(reportsRefresh)reportsRefresh.disabled=false;}
 };
 const refresh=async({before=null,append=false,searchTerm=null}={})=>{
  if(refreshing||document.visibilityState==='hidden')return;
  refreshing=true;
  try{
   const params=new URLSearchParams();if(before)params.set('before',before);const query=searchTerm===null?String(search?.value||'').trim():String(searchTerm||'').trim();if(query)params.set('q',query);const endpoint='/api/public-chat/messages'+(params.size?'?'+params.toString():'');const response=await fetch(endpoint,{headers:{accept:'application/json'},cache:'no-store'});
   if(!response.ok)throw new Error('Sohbet şu anda yüklenemiyor.');
   const data=await response.json();chatPaused=Boolean(data.control?.paused);if(controlStatus)controlStatus.textContent=chatPaused?'Sohbet durduruldu':'Sohbet açık';if(pauseButton){pauseButton.disabled=false;pauseButton.textContent=chatPaused?'Sohbeti yeniden aç':'Sohbeti durdur';}if(form){form.elements.message.disabled=chatPaused;const submit=form.querySelector('button[type=submit]');if(submit)submit.disabled=chatPaused;form.elements.message.placeholder=chatPaused?'Sohbet Owner tarafından durduruldu.':'Bir büyücü selamı bırak… (en fazla 500 karakter)';}const incoming=Array.isArray(data.messages)?data.messages:[];const searching=Boolean(query);if(searching){latestMessages=incoming;}else{const nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<72;const knownIds=new Set(loadedMessages.map(item=>item.message_id));if(loadedMessages.length&&!append&&!nearBottom){unseenMessageCount+=incoming.filter(item=>!knownIds.has(item.message_id)&&!item.is_own).length;}const merged=new Map(loadedMessages.map(item=>[item.message_id,item]));for(const item of incoming)merged.set(item.message_id,item);loadedMessages=Array.from(merged.values()).sort((a,b)=>Number(Boolean(b.pinned_at))-Number(Boolean(a.pinned_at))||new Date(a.created_at).getTime()-new Date(b.created_at).getTime());latestMessages=loadedMessages;if(nearBottom)unseenMessageCount=0;}updateNewMessagesButton();render(latestMessages,{preserveScroll:append});if(older)older.hidden=incoming.length<100;renderBlocked(Array.isArray(data.blocked)?data.blocked:[]);const presenceLabel=root.querySelector('[data-chat-presence]');if(presenceLabel){const names=Array.isArray(data.presence?.typing)?data.presence.typing:[];presenceLabel.textContent=(data.presence?.online||0)+' çevrimiçi'+(names.length?' · '+names.join(', ')+' yazıyor':'');}
  }catch(error){if(!list.children.length)say(error.message||'Sohbet yüklenemedi.');}
  finally{refreshing=false;}
 };
 let latestMessages=[];
 let loadedMessages=[];
 let unseenMessageCount=0;
 const updateNewMessagesButton=()=>{if(!newMessagesButton)return;newMessagesButton.hidden=unseenMessageCount===0;newMessagesButton.textContent=unseenMessageCount+' yeni mesaj · en alta git';};
 if(newMessagesButton){newMessagesButton.addEventListener('click',()=>{unseenMessageCount=0;updateNewMessagesButton();list.scrollTop=list.scrollHeight;});list.addEventListener('scroll',()=>{if(list.scrollHeight-list.scrollTop-list.clientHeight<48&&unseenMessageCount){unseenMessageCount=0;updateNewMessagesButton();}},{passive:true});}
 let searchTimer=null;if(search)search.addEventListener('input',()=>{render(latestMessages);if(searchTimer)window.clearTimeout(searchTimer);searchTimer=window.setTimeout(()=>refresh({searchTerm:search.value}),300);});
 if(older)older.addEventListener('click',()=>{const dated=latestMessages.filter(x=>x.created_at&&!x.pinned_at).map(x=>new Date(x.created_at).getTime()).filter(Number.isFinite);if(dated.length)refresh({before:new Date(Math.min(...dated)).toISOString(),append:true});});
 if(counter&&form){const updateCounter=()=>{counter.textContent=String(form.elements.message.value.length)+' / 500';};form.elements.message.addEventListener('input',updateCounter);updateCounter();}
 if(form){let lastTyping=0;form.elements.message.addEventListener('input',()=>{if(Date.now()-lastTyping>8000){lastTyping=Date.now();postAction('/api/public-chat/typing',{}).catch(()=>{});}});}
 if(pauseButton)pauseButton.addEventListener('click',async()=>{try{const result=await postAction('/api/public-chat/control',{paused:String(!chatPaused)});chatPaused=Boolean(result.paused);say(chatPaused?'Sohbet durduruldu.':'Sohbet yeniden açıldı.');await refresh();}catch(error){say(error.message||'Sohbet durumu değiştirilemedi.');}});
 if(reportsRefresh)reportsRefresh.addEventListener('click',loadReports);
 if(reportsRoot)reportsRoot.addEventListener('click',async event=>{const button=event.target.closest('button[data-chat-report-resolve]');if(!button)return;button.disabled=true;try{await postAction('/api/public-chat/reports/review',{reportId:button.dataset.chatReportResolve,status:button.dataset.status});say(button.dataset.status==='reviewed'?'Bildirim incelendi.':'Bildirim reddedildi.');await loadReports();}catch(error){say(error.message||'Bildirim güncellenemedi.');button.disabled=false;}});

 if(form){
  form.addEventListener('submit',async event=>{
   event.preventDefault();const input=form.elements.message;const message=String(input.value||'').trim();const mediaInput=form.querySelector('[data-chat-media]'),file=mediaInput?.files?.[0];if(!message&&!file)return;
   const button=form.querySelector('button[type=submit]');button.disabled=true;let mediaId=null;
   try{
    mediaId=file?await uploadMedia(file,'public','public',form.elements.csrf.value,form.querySelector('[data-chat-media-status]')):null;
    const response=await fetch('/api/public-chat/messages',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:form.elements.csrf.value,message,replyToMessageId:form.elements.replyToMessageId.value,mediaId:mediaId||''})});
    const data=await response.json().catch(()=>({}));
    if(response.status===429){await discardMedia(mediaId,form.elements.csrf.value);mediaId=null;say('Çok hızlı mesaj gönderiyorsun. Biraz bekle.');return;}
    if(!response.ok)throw new Error(data.status==='chat_paused'||response.status===423?'Sohbet Owner tarafından durduruldu.':data.error==='invalid_message'?'Mesaj veya yanıt geçersiz.':'Mesaj gönderilemedi. Oturumunu yenileyip tekrar dene.');
    mediaId=null;input.value='';if(mediaInput)mediaInput.value='';form.querySelector('[data-chat-media-status]')?.replaceChildren();form.elements.replyToMessageId.value='';replyTarget=null;if(replyPreview)replyPreview.hidden=true;if(replyLabel)replyLabel.textContent='';
    say('Mesajın gönderildi.');await refresh();
   }catch(error){await discardMedia(mediaId,form.elements.csrf.value);say(error.message||'Mesaj gönderilemedi.');}
   finally{button.disabled=false;input.focus();}
  });
  form.addEventListener('click',event=>{const toggle=event.target.closest('[data-chat-emoji-toggle]');if(toggle){const picker=form.querySelector('[data-chat-emoji-picker]');if(picker){picker.hidden=!picker.hidden;toggle.setAttribute('aria-expanded',String(!picker.hidden));}return;}const emojiButton=event.target.closest('[data-chat-emoji]');if(emojiButton){const input=form.elements.message,emoji=emojiButton.dataset.chatEmoji,start=input.selectionStart??input.value.length,end=input.selectionEnd??start;input.setRangeText(emoji,start,end,'end');input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();return;}if(!event.target.closest('[data-chat-reply-clear]'))return;replyTarget=null;form.elements.replyToMessageId.value='';if(replyPreview)replyPreview.hidden=true;if(replyLabel)replyLabel.textContent='';form.elements.message.focus();});
  list.addEventListener('click',async event=>{
   const button=event.target.closest('button');if(!button)return;
   try{
    if(button.dataset.chatReply){replyTarget=button.dataset.chatReply;form.elements.replyToMessageId.value=replyTarget;const item=button.closest('.public-chat-message');const name=item?.querySelector('.public-chat-message-meta strong')?.textContent||'mesaj';if(replyLabel)replyLabel.textContent=name+' mesajına yanıt veriyorsun';if(replyPreview)replyPreview.hidden=false;form.elements.message.focus();return;}
    if(button.dataset.chatReact){await postAction('/api/public-chat/reactions',{messageId:button.dataset.chatReact,emoji:button.dataset.emoji});await refresh();return;}
    if(button.dataset.chatEdit){const current=button.closest('.public-chat-message')?.querySelector('.public-chat-message-text')?.textContent||'';const body=await askChatDialog({title:'Mesajını düzenle',message:'Mesajını gönderimden sonraki 15 dakika içinde düzenleyebilirsin.',value:current,multiline:true,confirmLabel:'Kaydet'});if(body===null)return;await postAction('/api/public-chat/messages/edit',{messageId:button.dataset.chatEdit,body});say('Mesaj güncellendi.');await refresh();return;}
    if(button.dataset.chatDeleteOwn){if(!await askChatDialog({title:'Kendi mesajını sil',message:'Bu mesaj sohbetten kaldırılacak. Devam edilsin mi?',confirmOnly:true,confirmLabel:'Mesajı sil'}))return;await postAction('/api/public-chat/messages/delete',{messageId:button.dataset.chatDeleteOwn});say('Mesajın silindi.');await refresh();return;}if(button.dataset.chatDelete){if(!await askChatDialog({title:'Mesajı sil',message:'Bu mesajı topluluktan kaldırmak istiyor musun?',confirmOnly:true,confirmLabel:'Mesajı sil'}))return;await postAction('/api/public-chat/messages/delete',{messageId:button.dataset.chatDelete});say('Mesaj silindi.');await refresh();return;}
    if(button.dataset.chatPin){await postAction('/api/public-chat/pins',{messageId:button.dataset.chatPin});say('Sabitleme durumu güncellendi.');await refresh();return;}
    if(button.dataset.chatReport){const report=await askChatReport();if(!report)return;await postAction('/api/public-chat/reports',{messageId:button.dataset.chatReport,...report});say('Mesaj bildirimin alındı.');return;}
    if(button.dataset.chatBlock){if(!await askChatDialog({title:'Kullanıcıyı engelle',message:'Bu kullanıcının genel sohbet mesajları senin için gizlenecek. Devam edilsin mi?',confirmOnly:true,confirmLabel:'Engelle'}))return;await postAction('/api/public-chat/blocks',{messageId:button.dataset.chatBlock});say('Kullanıcı engellendi.');await refresh();}
   }catch(error){say(error.message||'İşlem tamamlanamadı.');}
  });
  if(blockedRoot)blockedRoot.addEventListener('click',async event=>{
   const button=event.target.closest('button[data-chat-unblock]');if(!button)return;
   try{await postAction('/api/public-chat/blocks/unblock',{targetAccountId:button.dataset.chatUnblock});say('Engel kaldırıldı.');await refresh();}
   catch(error){say(error.message||'Engel kaldırılamadı.');}
  });
 }


 const dmRoot=root.querySelector('[data-site-dm]');
 if(dmRoot){
  const dmFriend=dmRoot.querySelector('[data-site-dm-friend]'),dmList=dmRoot.querySelector('[data-site-dm-messages]'),dmForm=dmRoot.querySelector('[data-site-dm-form]'),dmFeedback=dmRoot.querySelector('[data-site-dm-feedback]');
  const groupRoot=root.querySelector('[data-site-dm-group]'),groupFriends=groupRoot?.querySelector('[data-site-dm-group-friends]'),groupSelect=groupRoot?.querySelector('[data-site-dm-group-select]'),groupList=groupRoot?.querySelector('[data-site-dm-group-messages]'),groupCreate=groupRoot?.querySelector('[data-site-dm-group-create]'),groupForm=groupRoot?.querySelector('[data-site-dm-group-form]'),groupFeedback=groupRoot?.querySelector('[data-site-dm-group-feedback]');
  let dmSelected='',groupSelected='',activeDmView='direct';
  const dmSay=value=>{if(dmFeedback)dmFeedback.textContent=value;},groupSay=value=>{if(groupFeedback)groupFeedback.textContent=value;};
  const dmRender=items=>{dmList.replaceChildren();if(!items.length){const li=document.createElement('li');li.textContent='Henüz mesaj yok. İlk selamı sen ver.';dmList.append(li);return;}for(const item of items){const li=document.createElement('li');li.className=item.is_own?'is-own':'';const body=document.createElement('p');body.textContent=String(item.body||'');const meta=document.createElement('small');meta.textContent=new Date(item.created_at).toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'})+(item.is_own?(item.read_at?' · Okundu':' · Gönderildi'):'');li.append(body);appendMedia(li,item);li.append(meta);dmList.append(li);}dmList.scrollTop=dmList.scrollHeight;};
  const dmLoad=async()=>{if(!dmSelected||document.visibilityState!=='visible')return;try{const response=await fetch('/api/site-dm/messages?with='+encodeURIComponent(dmSelected),{headers:{accept:'application/json'},cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok||data.status!=='ok')throw new Error('Bu arkadaşla özel mesajlaşma iznin bulunmuyor.');const messages=Array.isArray(data.messages)?data.messages:[];dmRender(messages);if(messages.some(item=>!item.is_own&&!item.read_at)){await fetch('/api/site-dm/read',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:dmForm.elements.csrf.value,recipientAccountId:dmSelected})});}}catch(error){dmSay(error.message||'Özel mesajlar yüklenemedi.');}};
  const groupRender=items=>{groupList.replaceChildren();if(!items.length){const li=document.createElement('li');li.textContent='Henüz grup mesajı yok. İlk mesajı sen gönder.';groupList.append(li);return;}for(const item of items){const li=document.createElement('li');li.className=item.is_own?'is-own':'';const body=document.createElement('p');body.textContent=String(item.body||'');const meta=document.createElement('small');if(item.is_own)meta.textContent='Sen';else if(/^site_[0-9a-f-]{36}$/i.test(String(item.sender_account_id||''))){const profile=document.createElement('a');profile.href='/u/'+encodeURIComponent(item.profile_slug||item.sender_account_id);profile.className='public-chat-profile-link';profile.textContent=String(item.username||'Gezgin');meta.append(profile);}else meta.textContent=String(item.username||'Gezgin');meta.append(document.createTextNode(' · '+new Date(item.created_at).toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'})+(item.is_own?(item.is_read?' · Okundu':' · Gönderildi'):'')));li.append(body);appendMedia(li,item);li.append(meta);groupList.append(li);}groupList.scrollTop=groupList.scrollHeight;};
  const groupLoad=async()=>{if(!groupSelected||document.visibilityState!=='visible')return;try{const response=await fetch('/api/site-dm/group-messages?groupId='+encodeURIComponent(groupSelected),{headers:{accept:'application/json'},cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok||data.status!=='ok')throw new Error('Bu gruba erişimin bulunmuyor.');const messages=Array.isArray(data.messages)?data.messages:[];groupRender(messages);if(messages.some(item=>!item.is_own&&!item.is_read)){await fetch('/api/site-dm/group-read',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:groupForm.elements.csrf.value,groupId:groupSelected})});}}catch(error){groupSay(error.message||'Grup mesajları yüklenemedi.');}};
  const loadGroups=async()=>{if(!groupRoot)return;try{const response=await fetch('/api/site-dm/groups',{headers:{accept:'application/json'},cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error('Grup listesi yüklenemedi.');const groups=Array.isArray(data.groups)?data.groups:[];groupSelect.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent=groups.length?'Bir grup seç':'Henüz grup oluşturmadın';groupSelect.append(empty);for(const group of groups){const option=document.createElement('option');option.value=group.group_id;option.textContent=String(group.title)+' · '+String(group.member_count)+' üye'+(Number(group.unread_count)>0?' · '+group.unread_count+' yeni':'');groupSelect.append(option);}if(groups.length){groupSelect.value=groups[0].group_id;groupSelected=groups[0].group_id;await groupLoad();}else{groupSelected='';const li=document.createElement('li');li.textContent='En az iki arkadaşını seçerek bir grup kurabilirsin.';groupList.replaceChildren(li);}}catch(error){groupSay(error.message||'Grup listesi yüklenemedi.');}};
  const dmFriends=async()=>{try{const response=await fetch('/api/site-dm/friends',{headers:{accept:'application/json'},cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error('Arkadaş listesi yüklenemedi.');const friends=Array.isArray(data.friends)?data.friends:[];dmFriend.replaceChildren();const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=friends.length?'Bir arkadaş seç':'Henüz kabul edilmiş arkadaşın yok';dmFriend.append(placeholder);for(const friend of friends){const option=document.createElement('option');option.value=String(friend.account_id||'');option.textContent=String(friend.username||'Gezgin');option.dataset.profileSlug=String(friend.profile_slug||'');option.dataset.username=String(friend.username||'Gezgin');dmFriend.append(option);}dmFriend.disabled=!friends.length;if(groupFriends){groupFriends.replaceChildren();for(const friend of friends){const option=document.createElement('option');option.value=String(friend.account_id||'');option.textContent=String(friend.username||'Gezgin');groupFriends.append(option);}groupFriends.disabled=friends.length<2;}const dmProfileLink=dmRoot.querySelector('[data-site-dm-profile]');const updateDmProfileLink=()=>{const selected=dmFriend.selectedOptions?.[0],id=String(selected?.value||'');if(dmProfileLink&&/^site_[0-9a-f-]{36}$/i.test(id)){dmProfileLink.href='/u/'+encodeURIComponent(selected.dataset.profileSlug||id);dmProfileLink.textContent=String(selected.dataset.username||'Gezgin')+' · Profili aç';dmProfileLink.hidden=false;}else if(dmProfileLink)dmProfileLink.hidden=true;};dmFriend.addEventListener('change',updateDmProfileLink);if(friends.length){dmFriend.value=friends[0].account_id;dmSelected=friends[0].account_id;updateDmProfileLink();await dmLoad();}else{const li=document.createElement('li');li.textContent='Özel mesajlaşmak için önce bir arkadaşlık isteği gönderip kabul edilmesini bekle.';dmList.replaceChildren(li);}}catch(error){dmSay(error.message||'Arkadaş listesi yüklenemedi.');}};
  dmFriend.addEventListener('change',()=>{dmSelected=dmFriend.value;dmSay('');dmLoad();});
  dmForm.addEventListener('submit',async event=>{event.preventDefault();const body=String(dmForm.elements.message.value||'').trim(),mediaInput=dmForm.querySelector('[data-chat-media]'),file=mediaInput?.files?.[0];if(!dmSelected||(!body&&!file))return;const button=dmForm.querySelector('button[type=submit]');button.disabled=true;let mediaId=null;try{mediaId=file?await uploadMedia(file,'dm',dmSelected,dmForm.elements.csrf.value,dmForm.querySelector('[data-chat-media-status]')):null;const response=await fetch('/api/site-dm/messages',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:dmForm.elements.csrf.value,recipientAccountId:dmSelected,message:body,mediaId:mediaId||''})});const data=await response.json().catch(()=>({}));if(!response.ok||data.status!=='sent')throw new Error(data.status==='rate_limited'?'Çok sık mesaj gönderiyorsun. Biraz bekle.':data.status==='not_allowed'?'Bu kullanıcıyla mesajlaşma iznin yok.':'Mesaj gönderilemedi.');mediaId=null;dmForm.elements.message.value='';if(mediaInput)mediaInput.value='';dmForm.querySelector('[data-chat-media-status]')?.replaceChildren();dmSay('Mesaj gönderildi.');await dmLoad();}catch(error){await discardMedia(mediaId,dmForm.elements.csrf.value);dmSay(error.message||'Mesaj gönderilemedi.');}finally{button.disabled=false;}});
  if(groupCreate)groupCreate.addEventListener('submit',async event=>{event.preventDefault();const selected=Array.from(groupFriends.selectedOptions).map(option=>option.value);if(selected.length<2){groupSay('Bir grup için en az iki arkadaş seç.');return;}const button=groupCreate.querySelector('button[type=submit]');button.disabled=true;try{const response=await fetch('/api/site-dm/groups',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:groupCreate.elements.csrf.value,title:groupCreate.elements.title.value,memberAccountIds:JSON.stringify(selected)})});const data=await response.json().catch(()=>({}));if(!response.ok||data.status!=='created')throw new Error(data.status==='not_allowed'?'Seçtiğin herkesle karşılıklı mesajlaşma iznin olmalı.':'Grup oluşturulamadı.');groupCreate.elements.title.value='';groupFriends.selectedIndex=-1;groupSay('Grup oluşturuldu.');await loadGroups();groupSelect.value=data.groupId;groupSelected=data.groupId;await groupLoad();}catch(error){groupSay(error.message||'Grup oluşturulamadı.');}finally{button.disabled=false;}});
  groupSelect.addEventListener('change',()=>{groupSelected=groupSelect.value;groupSay('');groupLoad();});
  groupForm.addEventListener('submit',async event=>{event.preventDefault();const body=String(groupForm.elements.message.value||'').trim(),mediaInput=groupForm.querySelector('[data-chat-media]'),file=mediaInput?.files?.[0];if(!groupSelected||(!body&&!file))return;const button=groupForm.querySelector('button[type=submit]');button.disabled=true;let mediaId=null;try{mediaId=file?await uploadMedia(file,'group',groupSelected,groupForm.elements.csrf.value,groupForm.querySelector('[data-chat-media-status]')):null;const response=await fetch('/api/site-dm/group-messages',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:groupForm.elements.csrf.value,groupId:groupSelected,message:body,mediaId:mediaId||''})});const data=await response.json().catch(()=>({}));if(!response.ok||data.status!=='sent')throw new Error(data.status==='rate_limited'?'Çok sık mesaj gönderiyorsun. Biraz bekle.':'Grup mesajı gönderilemedi.');mediaId=null;groupForm.elements.message.value='';if(mediaInput)mediaInput.value='';groupForm.querySelector('[data-chat-media-status]')?.replaceChildren();groupSay('Mesaj gönderildi.');await groupLoad();}catch(error){await discardMedia(mediaId,groupForm.elements.csrf.value);groupSay(error.message||'Grup mesajı gönderilemedi.');}finally{button.disabled=false;}});
  const leaveButton=groupRoot.querySelector('[data-site-dm-group-leave]');leaveButton.addEventListener('click',async()=>{if(!groupSelected||!await askChatDialog({title:'Gruptan ayrıl',message:'Bu gruptaki mesajlara erişimin sona erecek. Devam edilsin mi?',confirmOnly:true,confirmLabel:'Gruptan ayrıl'}))return;leaveButton.disabled=true;try{const response=await fetch('/api/site-dm/group-leave',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:groupForm.elements.csrf.value,groupId:groupSelected})});const data=await response.json().catch(()=>({}));if(!response.ok||data.status!=='left')throw new Error('Gruptan ayrılamadın.');groupSelected='';groupSay('Gruptan ayrıldın.');await loadGroups();}catch(error){groupSay(error.message||'Gruptan ayrılamadın.');}finally{leaveButton.disabled=false;}});
  const dmTabs=Array.from(root.querySelectorAll('[data-site-dm-tab]'));
  const setDmView=view=>{activeDmView=view;dmRoot.hidden=view!=='direct';groupRoot.hidden=view!=='group';for(const tab of dmTabs){const active=tab.dataset.siteDmTab===view;tab.setAttribute('aria-pressed',String(active));tab.classList.toggle('is-active',active);}if(view==='direct')dmLoad();else groupLoad();};
  for(const tab of dmTabs)tab.addEventListener('click',()=>setDmView(tab.dataset.siteDmTab==='group'?'group':'direct'));
  document.addEventListener('frieren-chat-update',event=>{
   const update=event.detail||{};if(document.visibilityState!=='visible')return;
   if(update.scope==='dm'){dmLoad();dmFriends();}
   if(update.scope==='group'){loadGroups();if(update.conversationId===groupSelected&&activeDmView==='group')groupLoad();}
  });
  dmFriends().then(loadGroups);window.setInterval(()=>{if(document.visibilityState==='visible'){if(activeDmView==='direct')dmLoad();else groupLoad();}},90000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(activeDmView==='direct')dmLoad();else groupLoad();}});
 }

 refresh();if(isOwner)loadReports();
 document.addEventListener('frieren-chat-update',event=>{if(event.detail?.scope==='public'&&document.visibilityState==='visible')refresh();});
 let chatEventSource=null;
 const connectChatEvents=()=>{
  if(!form||!window.EventSource||document.visibilityState!=='visible')return;
  chatEventSource?.close();chatEventSource=new EventSource('/api/chat-events');
  chatEventSource.addEventListener('chat-update',event=>{try{document.dispatchEvent(new CustomEvent('frieren-chat-update',{detail:JSON.parse(event.data)}));}catch{}});
 };
 connectChatEvents();
 const heartbeat=()=>{if(form&&document.visibilityState==='visible')postAction('/api/public-chat/presence',{}).catch(()=>{});};heartbeat();window.setInterval(heartbeat,30000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){refresh();heartbeat();scheduleRefresh();connectChatEvents();}else{chatEventSource?.close();chatEventSource=null;if(refreshTimer){window.clearInterval(refreshTimer);refreshTimer=null;}}});
 let refreshTimer=null;
 const scheduleRefresh=()=>{if(refreshTimer)window.clearInterval(refreshTimer);refreshTimer=window.setInterval(()=>{if(document.visibilityState==='visible')refresh();},60000);};
 scheduleRefresh();
})();
