(() => {
 const root=document.querySelector('[data-public-chat]');
 if(!root)return;
 const list=root.querySelector('[data-chat-messages]');
 const form=root.querySelector('[data-chat-form]');
 const feedback=root.querySelector('[data-chat-feedback]');
 const blockedRoot=root.querySelector('[data-chat-blocks]');
 const search=root.querySelector('[data-chat-search]');
 const count=root.querySelector('[data-chat-count]');
 const counter=root.querySelector('[data-chat-counter]');
 const replyPreview=root.querySelector('[data-chat-reply-preview]');
 const replyLabel=root.querySelector('[data-chat-reply-label]');
 let replyTarget=null;
 const say=message=>{if(feedback)feedback.textContent=message;};
 let refreshing=false;
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
 const render=messages=>{
  const nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<72;
  const query=String(search?.value||'').trim().toLocaleLowerCase('tr-TR');
  const visible=query?messages.filter(item=>(String(item.username||'')+' '+String(item.body||'')).toLocaleLowerCase('tr-TR').includes(query)):messages;
  if(count)count.textContent=query?visible.length+' / '+messages.length+' eşleşme':messages.length+' mesaj gösteriliyor';
  const fragment=document.createDocumentFragment();
  for(const item of visible){
   const li=document.createElement('li');li.className='public-chat-message';
   const avatar=document.createElement(item.avatar_url&&String(item.avatar_url).startsWith('/profil/media/public?accountId=')?'img':'span');avatar.className='public-chat-avatar';if(avatar.tagName==='IMG'){avatar.src=item.avatar_url;avatar.alt='';avatar.loading='lazy';}else avatar.textContent=Array.from(String(item.username||'G').trim())[0]?.toLocaleUpperCase('tr-TR')||'G';if(item.is_online){avatar.dataset.online='true';avatar.title='Çevrimiçi';}else{avatar.dataset.online='false';avatar.title='Çevrimdışı';}
   const body=document.createElement('div');body.className='public-chat-message-body';
   const meta=document.createElement('div');meta.className='public-chat-message-meta';
   const name=document.createElement('strong');name.textContent=String(item.username||'Gezgin');if(/^site_[0-9a-f-]{36}$/i.test(String(item.account_id||''))){const profileLink=document.createElement('a');profileLink.href='/u/'+encodeURIComponent(item.account_id);profileLink.textContent=name.textContent;profileLink.className='public-chat-profile-link';name.replaceWith(profileLink);}
   const time=document.createElement('time');const date=new Date(item.created_at);time.dateTime=Number.isNaN(date.getTime())?'':date.toISOString();time.textContent=Number.isNaN(date.getTime())?'':date.toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'})+(item.edited_at?' · düzenlendi':'');
   meta.append(name,time);body.append(meta);if(item.pinned_at){const pinned=document.createElement('span');pinned.className='public-chat-pinned';pinned.textContent='✦ Sabitlendi';body.append(pinned);}if(item.is_own&&Number(item.read_count)>0){const read=document.createElement('small');read.className='public-chat-read-count';read.textContent='Okundu · '+Number(item.read_count);body.append(read);}
   if(item.reply){const quote=document.createElement('blockquote');quote.className='public-chat-reply-quote';const qName=document.createElement('strong');qName.textContent=String(item.reply.username||'Yanıtlanan mesaj');const qText=document.createElement('span');qText.textContent=String(item.reply.body||'');quote.append(qName,qText);body.append(quote);}
   const text=document.createElement('p');text.className='public-chat-message-text';text.textContent=String(item.body||'');body.append(text);
   const actions=document.createElement('div');actions.className='public-chat-actions';
   if(form&&!item.is_own){const reply=document.createElement('button');reply.type='button';reply.className='public-chat-action';reply.textContent='Yanıtla';reply.dataset.chatReply=item.message_id;actions.append(reply);}
   if(form&&item.is_own){const edit=document.createElement('button');edit.type='button';edit.className='public-chat-action';edit.textContent='Düzenle';edit.dataset.chatEdit=item.message_id;actions.append(edit);const remove=document.createElement('button');remove.type='button';remove.className='public-chat-action';remove.textContent='Sil';remove.dataset.chatDelete=item.message_id;actions.append(remove);const pin=document.createElement('button');pin.type='button';pin.className='public-chat-action';pin.textContent=item.pinned_at?'Sabitlemeyi kaldır':'Sabitle';pin.dataset.chatPin=item.message_id;actions.append(pin);}
   for(const emoji of ['❤️','✨','😂']){
    const reaction=(Array.isArray(item.reactions)?item.reactions:[]).find(x=>x.emoji===emoji);
    const button=document.createElement('button');button.type='button';button.className='public-chat-reaction';button.textContent=emoji+' '+(reaction?.count||0);button.setAttribute('aria-pressed',String(Boolean(reaction?.reacted)));button.dataset.chatReact=item.message_id;button.dataset.emoji=emoji;
    if(form)actions.append(button);
   }
   if(form&&!item.is_own){const block=document.createElement('button');block.type='button';block.className='public-chat-action';block.textContent='Engelle';block.dataset.chatBlock=item.message_id;actions.append(block);}
   if(actions.children.length)body.append(actions);
   li.append(avatar,body);fragment.append(li);
  }
  list.replaceChildren(fragment);
  if(!visible.length){const empty=document.createElement('li');empty.className='public-chat-empty';empty.textContent=query?'Bu aramayla eşleşen mesaj bulunamadı.':'Henüz mesaj yok. İlk selamı sen verebilirsin.';list.append(empty);}
  else if(nearBottom)list.scrollTop=list.scrollHeight;
 };
 const postAction=async(path,values)=>{
  if(!form)return false;
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:form.elements.csrf.value,...values})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error==='invalid_chat_action'?'Bu işlem şu anda yapılamıyor.':'İşlem tamamlanamadı.');
  return data;
 };
 const refresh=async()=>{
  if(refreshing||document.visibilityState==='hidden')return;
  refreshing=true;
  try{
   const response=await fetch('/api/public-chat/messages',{headers:{accept:'application/json'},cache:'no-store'});
   if(!response.ok)throw new Error('Sohbet şu anda yüklenemiyor.');
   const data=await response.json();latestMessages=Array.isArray(data.messages)?data.messages:[];render(latestMessages);renderBlocked(Array.isArray(data.blocked)?data.blocked:[]);if(form)postAction('/api/public-chat/read',{}).catch(()=>{});const presenceLabel=root.querySelector('[data-chat-presence]');if(presenceLabel){const names=Array.isArray(data.presence?.typing)?data.presence.typing:[];presenceLabel.textContent=(data.presence?.online||0)+' çevrimiçi'+(names.length?' · '+names.join(', ')+' yazıyor':'');}
  }catch(error){if(!list.children.length)say(error.message||'Sohbet yüklenemedi.');}
  finally{refreshing=false;}
 };
 let latestMessages=[];
 if(search)search.addEventListener('input',()=>render(latestMessages));
 if(counter&&form){const updateCounter=()=>{counter.textContent=String(form.elements.message.value.length)+' / 500';};form.elements.message.addEventListener('input',updateCounter);updateCounter();}
 if(form){let lastTyping=0;form.elements.message.addEventListener('input',()=>{if(Date.now()-lastTyping>3500){lastTyping=Date.now();postAction('/api/public-chat/typing',{}).catch(()=>{});}});}
 if(form){
  form.addEventListener('submit',async event=>{
   event.preventDefault();const input=form.elements.message;const message=String(input.value||'').trim();if(!message)return;
   const button=form.querySelector('button[type=submit]');button.disabled=true;
   try{
    const response=await fetch('/api/public-chat/messages',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:form.elements.csrf.value,message,replyToMessageId:form.elements.replyToMessageId.value})});
    const data=await response.json().catch(()=>({}));
    if(response.status===429){say('Çok hızlı mesaj gönderiyorsun. Biraz bekle.');return;}
    if(!response.ok)throw new Error(data.error==='invalid_message'?'Mesaj veya yanıt geçersiz.':'Mesaj gönderilemedi. Oturumunu yenileyip tekrar dene.');
    input.value='';form.elements.replyToMessageId.value='';replyTarget=null;if(replyPreview)replyPreview.hidden=true;if(replyLabel)replyLabel.textContent='';
    say('Mesajın gönderildi.');await refresh();
   }catch(error){say(error.message||'Mesaj gönderilemedi.');}
   finally{button.disabled=false;input.focus();}
  });
  form.addEventListener('click',event=>{if(!event.target.closest('[data-chat-reply-clear]'))return;replyTarget=null;form.elements.replyToMessageId.value='';if(replyPreview)replyPreview.hidden=true;if(replyLabel)replyLabel.textContent='';form.elements.message.focus();});
  list.addEventListener('click',async event=>{
   const button=event.target.closest('button');if(!button)return;
   try{
    if(button.dataset.chatReply){replyTarget=button.dataset.chatReply;form.elements.replyToMessageId.value=replyTarget;const item=button.closest('.public-chat-message');const name=item?.querySelector('.public-chat-message-meta strong')?.textContent||'mesaj';if(replyLabel)replyLabel.textContent=name+' mesajına yanıt veriyorsun';if(replyPreview)replyPreview.hidden=false;form.elements.message.focus();return;}
    if(button.dataset.chatReact){await postAction('/api/public-chat/reactions',{messageId:button.dataset.chatReact,emoji:button.dataset.emoji});await refresh();return;}
    if(button.dataset.chatEdit){const current=button.closest('.public-chat-message')?.querySelector('.public-chat-message-text')?.textContent||'';const body=window.prompt('Mesajını düzenle (15 dakika içinde):',current);if(body===null)return;await postAction('/api/public-chat/messages/edit',{messageId:button.dataset.chatEdit,body});say('Mesaj güncellendi.');await refresh();return;}
    if(button.dataset.chatDelete){if(!window.confirm('Bu mesajı silmek istiyor musun?'))return;await postAction('/api/public-chat/messages/delete',{messageId:button.dataset.chatDelete});say('Mesaj silindi.');await refresh();return;}
    if(button.dataset.chatPin){await postAction('/api/public-chat/pins',{messageId:button.dataset.chatPin});say('Sabitleme durumu güncellendi.');await refresh();return;}
    if(button.dataset.chatBlock){if(!window.confirm('Bu kullanıcının mesajlarını gizlemek istiyor musun?'))return;await postAction('/api/public-chat/blocks',{messageId:button.dataset.chatBlock});say('Kullanıcı engellendi.');await refresh();}
   }catch(error){say(error.message||'İşlem tamamlanamadı.');}
  });
  if(blockedRoot)blockedRoot.addEventListener('click',async event=>{
   const button=event.target.closest('button[data-chat-unblock]');if(!button)return;
   try{await postAction('/api/public-chat/blocks/unblock',{targetAccountId:button.dataset.chatUnblock});say('Engel kaldırıldı.');await refresh();}
   catch(error){say(error.message||'Engel kaldırılamadı.');}
  });
 }
 refresh();
 const heartbeat=()=>{if(form&&document.visibilityState==='visible')postAction('/api/public-chat/presence',{}).catch(()=>{});};heartbeat();window.setInterval(heartbeat,30000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){refresh();heartbeat();}});
 window.setInterval(refresh,30000);
})();
