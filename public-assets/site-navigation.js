(() => {
  const toggle = document.getElementById('site-menu-toggle');
  const menu = document.getElementById('site-sidebar');
  const closeButton = document.getElementById('site-menu-close');
  if (!toggle || !menu || !closeButton) return;

  const focusable = () => [...menu.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter(element => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');

  const closeMenu = (restoreFocus = false) => {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Menüyü aç');
    menu.classList.remove('is-open');
    // Outside dismissal must update the semantic hidden state immediately.
    // CSS handles the visual transition while the menu remains open.
    menu.hidden = true;
    if (restoreFocus) toggle.focus();
  };

  const openMenu = () => {
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Menüyü kapat');
    window.requestAnimationFrame(() => menu.classList.add('is-open'));
    const firstLink = focusable()[0];
    if (firstLink) firstLink.focus();
  };

  toggle.addEventListener('click', () => {
    if (toggle.getAttribute('aria-expanded') === 'true') closeMenu(true);
    else openMenu();
  });
  closeButton.addEventListener('click', () => closeMenu(true));
  menu.addEventListener('click', event => {
    if (event.target.closest('a[href]')) closeMenu(false);
  });

  // Listen at the window boundary: this runs before document/page handlers and
  // also covers composed events from nested controls. Use the composed path
  // rather than only event.target so shadow-DOM retargeting cannot misclassify.
  const dismissFromOutside = event => {
    if (toggle.getAttribute('aria-expanded') !== 'true') return;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    if (!path.includes(menu) && !path.includes(toggle)) closeMenu(false);
  };
  window.addEventListener('pointerdown', dismissFromOutside, true);
  window.addEventListener('touchstart', dismissFromOutside, { capture: true, passive: true });
  window.addEventListener('click', dismissFromOutside, true);
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

  const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
  menu.querySelectorAll('[data-nav-path]').forEach(link => {
    if (link.getAttribute('data-nav-path') === currentPath) link.setAttribute('aria-current', 'page');
  });
})();
