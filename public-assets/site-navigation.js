(() => {
  const toggle = document.getElementById('site-menu-toggle');
  const sidebar = document.getElementById('site-sidebar');
  const backdrop = document.getElementById('site-menu-backdrop');
  const closeButton = document.getElementById('site-menu-close');
  if (!toggle || !sidebar || !backdrop || !closeButton) return;

  const focusable = () => [...sidebar.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter(element => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
  let closeTimer = null;

  const closeMenu = (restoreFocus = false) => {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Menüyü aç');
    document.body.classList.remove('site-menu-open');
    sidebar.classList.remove('is-open');
    backdrop.hidden = true;
    if (closeTimer) window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      if (!sidebar.classList.contains('is-open')) sidebar.hidden = true;
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240);
    if (restoreFocus) toggle.focus();
  };

  const openMenu = () => {
    if (closeTimer) window.clearTimeout(closeTimer);
    sidebar.hidden = false;
    backdrop.hidden = false;
    document.body.classList.add('site-menu-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Menüyü kapat');
    window.requestAnimationFrame(() => sidebar.classList.add('is-open'));
    const firstLink = focusable()[0];
    if (firstLink) firstLink.focus();
  };

  toggle.addEventListener('click', () => {
    if (toggle.getAttribute('aria-expanded') === 'true') closeMenu(true);
    else openMenu();
  });
  closeButton.addEventListener('click', () => closeMenu(true));
  backdrop.addEventListener('click', () => closeMenu(true));
  sidebar.addEventListener('click', event => {
    if (event.target.closest('a[href]')) closeMenu(false);
  });

  document.addEventListener('keydown', event => {
    if (toggle.getAttribute('aria-expanded') !== 'true') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusable();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === sidebar)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
  sidebar.querySelectorAll('[data-nav-path]').forEach(link => {
    if (link.getAttribute('data-nav-path') === currentPath) link.setAttribute('aria-current', 'page');
  });
})();
