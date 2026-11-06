(() => {
  const editor = document.querySelector('#profile-editor');
  const open = document.querySelector('[data-profile-editor-open]');
  const close = document.querySelector('[data-profile-editor-close]');
  if (!editor || !open) return;
  const setOpen = (value) => {
    editor.hidden = !value;
    open.setAttribute('aria-expanded', String(value));
    if (value) {
      editor.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      editor.querySelector('[data-media-input="avatar"]')?.focus({ preventScroll: true });
    } else open.focus();
  };
  open.setAttribute('aria-controls', 'profile-editor');
  open.setAttribute('aria-expanded', 'false');
  open.addEventListener('click', () => setOpen(true));
  close?.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !editor.hidden) setOpen(false);
  });
  const tabs = [...document.querySelectorAll('.profile-quick-nav a')];
  const sections = tabs.map((tab) => document.querySelector(tab.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window && sections.length) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        tabs.forEach((tab) => {
          const active = tab.getAttribute('href') === '#' + entry.target.id;
          tab.classList.toggle('is-current', active);
          if (active) tab.setAttribute('aria-current', 'location');
          else tab.removeAttribute('aria-current');
        });
      }
    }, { rootMargin: '-18% 0px -68% 0px', threshold: 0 });
    sections.forEach((section) => observer.observe(section));
  }
})();