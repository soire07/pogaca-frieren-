(() => {
  const toggle = document.getElementById('site-menu-toggle');
  const menu = document.getElementById('site-sidebar');
  const closeButton = document.getElementById('site-menu-close');
  if (!toggle || !menu || !closeButton) return;

  const focusable = () => [...menu.querySelectorAll('summary, a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter(element => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true' && !element.closest('details:not([open])'));

  const finishClose = () => {
    if (toggle.getAttribute('aria-expanded') !== 'true') menu.hidden = true;
  };

  const closeMenu = (restoreFocus = false) => {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Menüyü aç');
    menu.classList.remove('is-open');
    menu.inert = true;
    menu.addEventListener('transitionend', event => {
      if (event.target === menu) finishClose();
    }, { once: true });
    window.setTimeout(finishClose, 220);
    if (restoreFocus) toggle.focus();
  };

  const openMenu = () => {
    menu.hidden = false;
    menu.inert = false;
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Menüyü kapat');
    window.requestAnimationFrame(() => {
      if (toggle.getAttribute('aria-expanded') !== 'true') return;
      menu.classList.add('is-open');
      const firstItem = focusable()[0];
      if (firstItem) firstItem.focus();
    });
  };

  toggle.addEventListener('click', () => {
    if (toggle.getAttribute('aria-expanded') === 'true') closeMenu(true);
    else openMenu();
  });
  closeButton.addEventListener('click', () => closeMenu(true));
  menu.addEventListener('click', event => {
    if (event.target.closest('a[href]')) closeMenu(false);
  });

  const dismissFromOutside = event => {
    if (toggle.getAttribute('aria-expanded') !== 'true') return;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    if (!path.includes(menu) && !path.includes(toggle)) closeMenu(false);
  };
  window.addEventListener('pointerdown', dismissFromOutside, true);

  const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
  const currentHash = window.location.hash;
  let activeGroup = null;
  menu.querySelectorAll('[data-nav-path]').forEach(link => {
    const target = new URL(link.getAttribute('href'), window.location.origin);
    const matches = target.pathname.replace(/\/$/, '') === currentPath &&
      (target.hash ? target.hash === currentHash : !currentHash);
    if (!matches) return;
    link.setAttribute('aria-current', 'page');
    activeGroup = link.closest('[data-nav-group]');
  });
  if (activeGroup) {
    menu.querySelectorAll('[data-nav-group]').forEach(group => { group.open = group === activeGroup; });
  }

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
    if (event.shiftKey && (document.activeElement === first || document.activeElement === menu)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
})();