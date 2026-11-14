(() => {
  const gallery = document.querySelector('[data-theme-gallery]');
  if (!gallery) return;
  const form = gallery.closest('form');
  const select = form?.querySelector('select[name="theme"]');
  if (!select) return;

  const showcase = document.querySelector('.account-profile-showcase[data-theme]');
  const sync = () => {
    for (const choice of gallery.querySelectorAll('[data-theme-choice]')) {
      choice.setAttribute('aria-pressed', String(choice.dataset.themeChoice === select.value));
    }
    if (showcase) showcase.dataset.theme = select.value;
  };

  gallery.addEventListener('click', event => {
    const choice = event.target.closest('[data-theme-choice]');
    if (!choice || !gallery.contains(choice)) return;
    const theme = choice.dataset.themeChoice;
    if (![...select.options].some(option => option.value === theme)) return;
    select.value = theme;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    sync();
  });

  select.addEventListener('change', sync);
  gallery.dataset.themeGalleryReady = 'true';
  gallery.dataset.livePreview = 'true';
  sync();
})();