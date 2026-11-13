(() => {
  const panel = document.querySelector('[data-accessibility-panel]');
  if (!panel) return;

  const storageKey = 'frieren-accessibility-v1';
  const root = document.documentElement;
  const validFont = new Set(['normal', 'large', 'x-large']);
  const prefersReducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const defaults = () => ({ font: 'normal', contrast: 'normal', motion: prefersReducedMotion() ? 'reduce' : 'normal' });
  let preferences = defaults();

  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
    if (saved && typeof saved === 'object') {
      if (validFont.has(saved.font)) preferences.font = saved.font;
      if (saved.contrast === 'high' || saved.contrast === 'normal') preferences.contrast = saved.contrast;
      if (saved.motion === 'reduce' || saved.motion === 'normal') preferences.motion = saved.motion;
    }
  } catch {
    // Storage may be unavailable in private or restricted browsing contexts.
  }

  const persist = () => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(preferences));
    } catch {
      // Controls remain functional for the current page when storage is unavailable.
    }
  };

  const render = () => {
    root.dataset.a11yFont = preferences.font;
    root.dataset.a11yContrast = preferences.contrast;
    root.dataset.a11yMotion = preferences.motion;
    for (const button of panel.querySelectorAll('[data-accessibility-font]')) {
      const active = button.dataset.accessibilityFont === preferences.font;
      button.setAttribute('aria-pressed', String(active));
    }
    const contrast = panel.querySelector('[data-accessibility-contrast]');
    if (contrast) {
      contrast.setAttribute('aria-pressed', String(preferences.contrast === 'high'));
      contrast.textContent = preferences.contrast === 'high' ? 'Yüksek kontrastı kapat' : 'Yüksek kontrastı aç';
    }
    const motion = panel.querySelector('[data-accessibility-motion]');
    if (motion) {
      motion.setAttribute('aria-pressed', String(preferences.motion === 'reduce'));
      motion.textContent = preferences.motion === 'reduce' ? 'Animasyonları normalleştir' : 'Animasyonları azalt';
    }
  };

  panel.addEventListener('click', event => {
    const fontButton = event.target.closest('[data-accessibility-font]');
    if (fontButton && validFont.has(fontButton.dataset.accessibilityFont)) {
      preferences.font = fontButton.dataset.accessibilityFont;
    } else if (event.target.closest('[data-accessibility-contrast]')) {
      preferences.contrast = preferences.contrast === 'high' ? 'normal' : 'high';
    } else if (event.target.closest('[data-accessibility-motion]')) {
      preferences.motion = preferences.motion === 'reduce' ? 'normal' : 'reduce';
    } else {
      return;
    }
    render();
    persist();
    const status = panel.querySelector('[data-accessibility-status]');
    if (status) status.textContent = 'Görünüm tercihin kaydedildi.';
  });

  panel.dataset.accessibilityReady = 'true';
  render();
})();