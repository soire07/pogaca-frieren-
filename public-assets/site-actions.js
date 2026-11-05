(() => {
  const pendingForms = new WeakSet();
  document.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (pendingForms.has(form)) {
      event.preventDefault();
      return;
    }
    if (form.matches('form[action="/hesap/sil"]')
      && !window.confirm('Portal hesabın ve Discord bağlantıların silinecek. RPG karakterlerin korunacak. Devam etmek istiyor musun?')) {
      event.preventDefault();
      return;
    }
    if (form.matches('form[action="/pazar/al"]')
      && !window.confirm('Bu ilanı satın almak için altın bakiyenden düşülecek. Devam edilsin mi?')) {
      event.preventDefault();
      return;
    }
    pendingForms.add(form);
    form.setAttribute('aria-busy', 'true');
    const submitter = event.submitter;
    if (submitter instanceof HTMLButtonElement && submitter.type === 'submit') {
      submitter.dataset.originalLabel = submitter.textContent || '';
      submitter.disabled = true;
      submitter.setAttribute('aria-busy', 'true');
      submitter.textContent = 'Büyü işleniyor…';
    }
  });
  window.addEventListener('pageshow', () => {
    document.querySelectorAll('form[aria-busy="true"]').forEach(form => {
      form.removeAttribute('aria-busy');
      form.querySelectorAll('button[data-original-label]').forEach(button => {
        button.disabled = false;
        button.textContent = button.dataset.originalLabel || button.textContent;
        button.removeAttribute('aria-busy');
        delete button.dataset.originalLabel;
      });
    });
  });
})();