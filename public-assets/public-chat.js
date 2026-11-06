(() => {
 const root=document.querySelector('[data-public-chat]');
 if(!root)return;
 const list=root.querySelector('[data-chat-messages]');
 const form=root.querySelector('[data-chat-form]');
 const feedback=root.querySelector('[data-chat-feedback]');
 let newest='';
 const say=(message)=>{if(feedback)feedback.textContent=message;};
 const render=(messages)=>{
  const nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<72;
  const fragment=document.createDocumentFragment();
  for(const item of messages){
   const li=document.createElement('li');li.className='public-chat-message';
   const avatar=document.createElement('span');avatar.className='public-chat-avatar';avatar.textContent=Array.from(String(item.username||'G').trim())[0]?.toLocaleUpperCase('tr-TR')||'G';
   const body=document.createElement('div');body.className='public-chat-message-body';
   const meta=document.createElement('div');meta.className='public-chat-message-meta';
   const name=document.createElement('strong');name.textContent=String(item.username||'Gezgin');
   const time=document.createElement('time');const date=new Date(item.created_at);time.dateTime=Number.isNaN(date.getTime())?'':date.toISOString();time.textContent=Number.isNaN(date.getTime())?'':date.toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'});
   const text=document.createElement('p');text.className='public-chat-message-text';text.textContent=String(item.body||'');
   meta.append(name,time);body.append(meta,text);li.append(avatar,body);fragment.append(li);
  }
  list.replaceChildren(fragment);
  if(!messages.length){const empty=document.createElement('li');empty.className='public-chat-empty';empty.textContent='Henüz mesaj yok. İlk selamı sen verebilirsin.';list.append(empty);}
  else if(nearBottom)list.scrollTop=list.scrollHeight;
  newest=messages.at(-1)?.message_id||'';
 };
 const refresh=async()=>{
  try{const response=await fetch('/api/public-chat/messages',{headers:{accept:'application/json'},cache:'no-store'});if(!response.ok)throw new Error('Sohbet şu anda yüklenemiyor.');const data=await response.json();render(Array.isArray(data.messages)?data.messages:[]);}
  catch(error){if(!list.children.length)say(error.message||'Sohbet yüklenemedi.');}
 };
 if(form){
  form.addEventListener('submit',async event=>{
   event.preventDefault();const input=form.elements.message;const message=String(input.value||'').trim();if(!message)return;
   const button=form.querySelector('button[type=submit]');button.disabled=true;
   try{
    const response=await fetch('/api/public-chat/messages',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:form.elements.csrf.value,message})});
    const data=await response.json().catch(()=>({}));
    if(response.status===429){say('Çok hızlı mesaj gönderiyorsun. Biraz bekle.');return;}
    if(!response.ok)throw new Error('Mesaj gönderilemedi. Oturumunu yenileyip tekrar dene.');
    input.value='';say('Mesajın gönderildi.');await refresh();
   }catch(error){say(error.message||'Mesaj gönderilemedi.');}
   finally{button.disabled=false;input.focus();}
  });
 }
 refresh();
 window.setInterval(refresh,8000);
})();
