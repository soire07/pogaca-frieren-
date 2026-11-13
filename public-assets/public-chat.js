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
   const avatar=document.createElement(item.avatar_url&&String(item.avatar_url).startsWith('/profil/media/public?accountId=')?'img':'span');avatar.className='public-chat-avatar';if(avatar.tagName==='IMG'){avatar.src=item.avatar_url;avatar.alt='';avatar.loading='lazy';}else avatar.textContent=Array.from(String(item.username||'G').trim())[0]?.toLocaleUpperCase('tr-TR')||'G';if(item.is_online){avatar.dataset.online='true';avatar.title='Çevrimiçi';}else{avatar.dataset.online='false';avatar.title='Çevrimdışı';}
   const body=document.createElement('div');body.className='public-chat-message-body';
   const meta=document.createElement('div');meta.className='public-chat-message-meta';
   const name=document.createElement('strong');name.textContent=String(item.username||'Gezgin');if(/^site_[0-9a-f-]{36}$/i.test(String(item.account_id||''))){const profileLink=document.createElement('a');profileLink.href='/u/'+encodeURIComponent(item.profile_slug||item.account_id);profileLink.textContent=name.textContent;profileLink.className='public-chat-profile-link';name.replaceWith(profileLink);}
   const time=document.createElement('time');const date=new Date(item.created_at);time.dateTime=Number.isNaN(date.getTime())?'':date.toISOString();time.textContent=Number.isNaN(date.getTime())?'':date.toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'})+(item.edited_at?' · düzenlendi':'');
   const ownerBadge=item.is_owner===true?document.createElement('span'):null;if(ownerBadge){ownerBadge.className='public-chat-owner-badge';ownerBadge.textContent='OWNER';ownerBadge.setAttribute('aria-label','Site sahibi');}meta.append(name);if(ownerBadge)meta.append(ownerBadge);meta.append(time);body.append(meta);if(item.pinned_at){const pinned=document.createElement('span');pinned.className='public-chat-pinned';pinned.textContent='✦ Sabitlendi';body.append(pinned);}if(item.is_own&&Number(item.read_count)>0){const read=document.createElement('small');read.className='public-chat-read-count';read.textContent='Okundu · '+Number(item.read_count);body.append(read);}
   if(item.reply){const quote=document.createElement('blockquote');quote.className='public-chat-reply-quote';const qName=document.createElement('strong');qName.textContent=String(item.reply.username||'Yanıtlanan mesaj');const qText=document.createElement('span');qText.textContent=String(item.reply.body||'');quote.append(qName,qText);body.append(quote);}
   const text=document.createElement('p');text.className='public-chat-message-text';text.textContent=item.deleted_at?'Bu mesaj silindi':String(item.body||'');if(item.deleted_at)text.classList.add('is-deleted');body.append(text);
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
   li.append(avatar,body);fragment.append(li);
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
   event.preventDefault();const input=form.elements.message;const message=String(input.value||'').trim();if(!message)return;
   const button=form.querySelector('button[type=submit]');button.disabled=true;
   try{
    const response=await fetch('/api/public-chat/messages',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:form.elements.csrf.value,message,replyToMessageId:form.elements.replyToMessageId.value})});
    const data=await response.json().catch(()=>({}));
    if(response.status===429){say('Çok hızlı mesaj gönderiyorsun. Biraz bekle.');return;}
    if(!response.ok)throw new Error(data.status==='chat_paused'||response.status===423?'Sohbet Owner tarafından durduruldu.':data.error==='invalid_message'?'Mesaj veya yanıt geçersiz.':'Mesaj gönderilemedi. Oturumunu yenileyip tekrar dene.');
    input.value='';form.elements.replyToMessageId.value='';replyTarget=null;if(replyPreview)replyPreview.hidden=true;if(replyLabel)replyLabel.textContent='';
    say('Mesajın gönderildi.');await refresh();
   }catch(error){say(error.message||'Mesaj gönderilemedi.');}
   finally{button.disabled=false;input.focus();}
  });
  form.addEventListener('click',event=>{const toggle=event.target.closest('[data-chat-emoji-toggle]');if(toggle){const picker=form.querySelector('[data-chat-emoji-picker]');if(picker){picker.hidden=!picker.hidden;toggle.setAttribute('aria-expanded',String(!picker.hidden));}return;}const emojiButton=event.target.closest('[data-chat-emoji]');if(emojiButton){const input=form.elements.message,emoji=emojiButton.dataset.chatEmoji,start=input.selectionStart??input.value.length,end=input.selectionEnd??start;input.setRangeText(emoji,start,end,'end');input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();return;}if(!event.target.closest('[data-chat-reply-clear]'))return;replyTarget=null;form.elements.replyToMessageId.value='';if(replyPreview)replyPreview.hidden=true;if(replyLabel)replyLabel.textContent='';form.elements.message.focus();});
  list.addEventListener('click',async event=>{
   const button=event.target.closest('button');if(!button)return;
   try{
    if(button.dataset.chatReply){replyTarget=button.dataset.chatReply;form.elements.replyToMessageId.value=replyTarget;const item=button.closest('.public-chat-message');const name=item?.querySelector('.public-chat-message-meta strong')?.textContent||'mesaj';if(replyLabel)replyLabel.textContent=name+' mesajına yanıt veriyorsun';if(replyPreview)replyPreview.hidden=false;form.elements.message.focus();return;}
    if(button.dataset.chatReact){await postAction('/api/public-chat/reactions',{messageId:button.dataset.chatReact,emoji:button.dataset.emoji});await refresh();return;}
    if(button.dataset.chatEdit){const current=button.closest('.public-chat-message')?.querySelector('.public-chat-message-text')?.textContent||'';const body=window.prompt('Mesajını düzenle (15 dakika içinde):',current);if(body===null)return;await postAction('/api/public-chat/messages/edit',{messageId:button.dataset.chatEdit,body});say('Mesaj güncellendi.');await refresh();return;}
    if(button.dataset.chatDeleteOwn){if(!window.confirm('Kendi mesajını silmek istiyor musun?'))return;await postAction('/api/public-chat/messages/delete',{messageId:button.dataset.chatDeleteOwn});say('Mesajın silindi.');await refresh();return;}if(button.dataset.chatDelete){if(!window.confirm('Bu mesajı Owner olarak silmek istiyor musun?'))return;await postAction('/api/public-chat/messages/delete',{messageId:button.dataset.chatDelete});say('Mesaj silindi.');await refresh();return;}
    if(button.dataset.chatPin){await postAction('/api/public-chat/pins',{messageId:button.dataset.chatPin});say('Sabitleme durumu güncellendi.');await refresh();return;}
    if(button.dataset.chatReport){const reason=window.prompt('Bildirim nedeni: spam / harassment / inappropriate / other','other');if(!reason)return;const details=window.prompt('Ek açıklama (isteğe bağlı):','')||'';await postAction('/api/public-chat/reports',{messageId:button.dataset.chatReport,reason:reason.trim().toLowerCase(),details});say('Mesaj bildirimin alındı.');return;}
    if(button.dataset.chatBlock){if(!window.confirm('Bu kullanıcının mesajlarını gizlemek istiyor musun?'))return;await postAction('/api/public-chat/blocks',{messageId:button.dataset.chatBlock});say('Kullanıcı engellendi.');await refresh();}
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
  let dmSelected='',groupSelected='';
  const dmSay=value=>{if(dmFeedback)dmFeedback.textContent=value;},groupSay=value=>{if(groupFeedback)groupFeedback.textContent=value;};
  const dmRender=items=>{dmList.replaceChildren();if(!items.length){const li=document.createElement('li');li.textContent='Henüz mesaj yok. İlk selamı sen ver.';dmList.append(li);return;}for(const item of items){const li=document.createElement('li');li.className=item.is_own?'is-own':'';const body=document.createElement('p');body.textContent=String(item.body||'');const meta=document.createElement('small');meta.textContent=new Date(item.created_at).toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'})+(item.is_own?(item.read_at?' · Okundu':' · Gönderildi'):'');li.append(body,meta);dmList.append(li);}dmList.scrollTop=dmList.scrollHeight;};
  const dmLoad=async()=>{if(!dmSelected||document.visibilityState!=='visible')return;try{const response=await fetch('/api/site-dm/messages?with='+encodeURIComponent(dmSelected),{headers:{accept:'application/json'},cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok||data.status!=='ok')throw new Error('Bu arkadaşla özel mesajlaşma iznin bulunmuyor.');const messages=Array.isArray(data.messages)?data.messages:[];dmRender(messages);if(messages.some(item=>!item.is_own&&!item.read_at)){await fetch('/api/site-dm/read',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:dmForm.elements.csrf.value,recipientAccountId:dmSelected})});}}catch(error){dmSay(error.message||'Özel mesajlar yüklenemedi.');}};
  const groupRender=items=>{groupList.replaceChildren();if(!items.length){const li=document.createElement('li');li.textContent='Henüz grup mesajı yok. İlk mesajı sen gönder.';groupList.append(li);return;}for(const item of items){const li=document.createElement('li');li.className=item.is_own?'is-own':'';const body=document.createElement('p');body.textContent=String(item.body||'');const meta=document.createElement('small');meta.textContent=(item.is_own?'Sen':String(item.username||'Gezgin'))+' · '+new Date(item.created_at).toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'})+(item.is_own?(item.is_read?' · Okundu':' · Gönderildi'):'');li.append(body,meta);groupList.append(li);}groupList.scrollTop=groupList.scrollHeight;};
  const groupLoad=async()=>{if(!groupSelected||document.visibilityState!=='visible')return;try{const response=await fetch('/api/site-dm/group-messages?groupId='+encodeURIComponent(groupSelected),{headers:{accept:'application/json'},cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok||data.status!=='ok')throw new Error('Bu gruba erişimin bulunmuyor.');const messages=Array.isArray(data.messages)?data.messages:[];groupRender(messages);if(messages.some(item=>!item.is_own&&!item.is_read)){await fetch('/api/site-dm/group-read',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:groupForm.elements.csrf.value,groupId:groupSelected})});}}catch(error){groupSay(error.message||'Grup mesajları yüklenemedi.');}};
  const loadGroups=async()=>{if(!groupRoot)return;try{const response=await fetch('/api/site-dm/groups',{headers:{accept:'application/json'},cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error('Grup listesi yüklenemedi.');const groups=Array.isArray(data.groups)?data.groups:[];groupSelect.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent=groups.length?'Bir grup seç':'Henüz grup oluşturmadın';groupSelect.append(empty);for(const group of groups){const option=document.createElement('option');option.value=group.group_id;option.textContent=String(group.title)+' · '+String(group.member_count)+' üye'+(Number(group.unread_count)>0?' · '+group.unread_count+' yeni':'');groupSelect.append(option);}if(groups.length){groupSelect.value=groups[0].group_id;groupSelected=groups[0].group_id;await groupLoad();}else{groupSelected='';const li=document.createElement('li');li.textContent='En az iki arkadaşını seçerek bir grup kurabilirsin.';groupList.replaceChildren(li);}}catch(error){groupSay(error.message||'Grup listesi yüklenemedi.');}};
  const dmFriends=async()=>{try{const response=await fetch('/api/site-dm/friends',{headers:{accept:'application/json'},cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error('Arkadaş listesi yüklenemedi.');const friends=Array.isArray(data.friends)?data.friends:[];dmFriend.replaceChildren();const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=friends.length?'Bir arkadaş seç':'Henüz kabul edilmiş arkadaşın yok';dmFriend.append(placeholder);for(const friend of friends){const option=document.createElement('option');option.value=String(friend.account_id||'');option.textContent=String(friend.username||'Gezgin');dmFriend.append(option);}dmFriend.disabled=!friends.length;if(groupFriends){groupFriends.replaceChildren();for(const friend of friends){const option=document.createElement('option');option.value=String(friend.account_id||'');option.textContent=String(friend.username||'Gezgin');groupFriends.append(option);}groupFriends.disabled=friends.length<2;}if(friends.length){dmFriend.value=friends[0].account_id;dmSelected=friends[0].account_id;await dmLoad();}else{const li=document.createElement('li');li.textContent='Özel mesajlaşmak için önce bir arkadaşlık isteği gönderip kabul edilmesini bekle.';dmList.replaceChildren(li);}}catch(error){dmSay(error.message||'Arkadaş listesi yüklenemedi.');}};
  dmFriend.addEventListener('change',()=>{dmSelected=dmFriend.value;dmSay('');dmLoad();});
  dmForm.addEventListener('submit',async event=>{event.preventDefault();const body=String(dmForm.elements.message.value||'').trim();if(!dmSelected||!body)return;const button=dmForm.querySelector('button[type=submit]');button.disabled=true;try{const response=await fetch('/api/site-dm/messages',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:dmForm.elements.csrf.value,recipientAccountId:dmSelected,message:body})});const data=await response.json().catch(()=>({}));if(!response.ok||data.status!=='sent')throw new Error(data.status==='rate_limited'?'Çok sık mesaj gönderiyorsun. Biraz bekle.':data.status==='not_allowed'?'Bu kullanıcıyla mesajlaşma iznin yok.':'Mesaj gönderilemedi.');dmForm.elements.message.value='';dmSay('Mesaj gönderildi.');await dmLoad();}catch(error){dmSay(error.message||'Mesaj gönderilemedi.');}finally{button.disabled=false;}});
  if(groupCreate)groupCreate.addEventListener('submit',async event=>{event.preventDefault();const selected=Array.from(groupFriends.selectedOptions).map(option=>option.value);if(selected.length<2){groupSay('Bir grup için en az iki arkadaş seç.');return;}const button=groupCreate.querySelector('button[type=submit]');button.disabled=true;try{const response=await fetch('/api/site-dm/groups',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:groupCreate.elements.csrf.value,title:groupCreate.elements.title.value,memberAccountIds:JSON.stringify(selected)})});const data=await response.json().catch(()=>({}));if(!response.ok||data.status!=='created')throw new Error(data.status==='not_allowed'?'Seçtiğin herkesle karşılıklı mesajlaşma iznin olmalı.':'Grup oluşturulamadı.');groupCreate.elements.title.value='';groupFriends.selectedIndex=-1;groupSay('Grup oluşturuldu.');await loadGroups();groupSelect.value=data.groupId;groupSelected=data.groupId;await groupLoad();}catch(error){groupSay(error.message||'Grup oluşturulamadı.');}finally{button.disabled=false;}});
  groupSelect.addEventListener('change',()=>{groupSelected=groupSelect.value;groupSay('');groupLoad();});
  groupForm.addEventListener('submit',async event=>{event.preventDefault();const body=String(groupForm.elements.message.value||'').trim();if(!groupSelected||!body)return;const button=groupForm.querySelector('button[type=submit]');button.disabled=true;try{const response=await fetch('/api/site-dm/group-messages',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:groupForm.elements.csrf.value,groupId:groupSelected,message:body})});const data=await response.json().catch(()=>({}));if(!response.ok||data.status!=='sent')throw new Error(data.status==='rate_limited'?'Çok sık mesaj gönderiyorsun. Biraz bekle.':'Grup mesajı gönderilemedi.');groupForm.elements.message.value='';groupSay('Mesaj gönderildi.');await groupLoad();}catch(error){groupSay(error.message||'Grup mesajı gönderilemedi.');}finally{button.disabled=false;}});
  const leaveButton=groupRoot.querySelector('[data-site-dm-group-leave]');leaveButton.addEventListener('click',async()=>{if(!groupSelected)return;leaveButton.disabled=true;try{const response=await fetch('/api/site-dm/group-leave',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:groupForm.elements.csrf.value,groupId:groupSelected})});const data=await response.json().catch(()=>({}));if(!response.ok||data.status!=='left')throw new Error('Gruptan ayrılamadın.');groupSelected='';groupSay('Gruptan ayrıldın.');await loadGroups();}catch(error){groupSay(error.message||'Gruptan ayrılamadın.');}finally{leaveButton.disabled=false;}});
  dmFriends().then(loadGroups);window.setInterval(dmLoad,30000);window.setInterval(groupLoad,60000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){dmLoad();groupLoad();}});
 }

 refresh();if(isOwner)loadReports();
 const heartbeat=()=>{if(form&&document.visibilityState==='visible')postAction('/api/public-chat/presence',{}).catch(()=>{});};heartbeat();window.setInterval(heartbeat,30000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){refresh();heartbeat();scheduleRefresh();}else if(refreshTimer){window.clearInterval(refreshTimer);refreshTimer=null;}});
 let refreshTimer=null;
 const scheduleRefresh=()=>{if(refreshTimer)window.clearInterval(refreshTimer);refreshTimer=window.setInterval(()=>{if(document.visibilityState==='visible')refresh();},30000);};
 scheduleRefresh();
})();
