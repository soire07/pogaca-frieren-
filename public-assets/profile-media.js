(() => {
  const editor=document.querySelector('[data-profile-media-editor]');
  if(!editor)return;
  const csrf=editor.dataset.csrf||'';
  const status=editor.querySelector('[data-media-status]');
  const setStatus=(message,error=false)=>{status.textContent=message;status.dataset.error=error?'true':'false';};
  const endpoint='/profil/media';
  editor.querySelector('[data-media-preview="banner"]')?.addEventListener('error',event=>{event.currentTarget.src='/assets/site-profile-banner.svg';});
  const preview=(kind,url)=>{const image=editor.querySelector('[data-media-preview="'+kind+'"]');if(image)image.src=url;};
  const upload=async(kind,file)=>{
    if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setStatus('Yalnızca JPG, PNG veya WebP görseli seç.',true);return;}
    if(file.size>12*1024*1024){setStatus('Kaynak görsel 12 MB sınırını aşıyor.',true);return;}
    try{
      const bitmap=await createImageBitmap(file);
      const max=kind==='avatar'?512:1920,ratio=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
      const context=canvas.getContext('2d');context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      const data=canvas.toDataURL('image/jpeg',.88).split(',')[1];
      const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({kind,data})});
      if(!response.ok)throw new Error(response.status===413?'Görsel çok büyük.':response.status===403?'Güvenlik doğrulaması başarısız. Sayfayı yenile.':'Görsel kaydedilemedi.');
      const result=await response.json();if(result.status!=='saved')throw new Error('Görsel kaydedilemedi.');
      preview(kind,endpoint+'?kind='+kind+'&v='+Date.now());setStatus(kind==='avatar'?'Profil fotoğrafı kaydedildi.':'Banner kaydedildi.');
    }catch(error){setStatus(error.message||'Görsel işlenemedi.',true);}
  };
  editor.querySelectorAll('[data-media-input]').forEach(input=>input.addEventListener('change',()=>upload(input.dataset.mediaInput,input.files?.[0])));
  editor.querySelectorAll('[data-media-reset]').forEach(button=>button.addEventListener('click',async()=>{
    const kind=button.dataset.mediaReset;
    if(!window.confirm(kind==='avatar'?'Özel profil fotoğrafını kaldırıp Discord avatarına dönmek istiyor musun?':'Özel bannerı kaldırıp varsayılan bannerı kullanmak istiyor musun?'))return;
    try{
      const response=await fetch(endpoint+'?kind='+kind,{method:'DELETE',credentials:'same-origin',headers:{'X-CSRF-Token':csrf}});
      if(!response.ok)throw new Error('Görsel sıfırlanamadı.');
      preview(kind,kind==='avatar'?(editor.dataset.discordAvatar||'/assets/site-avatar.webp'):'/assets/site-profile-banner.svg');setStatus('Görünüm varsayılana döndürüldü.');
    }catch(error){setStatus(error.message,true);}
  }));
})();
