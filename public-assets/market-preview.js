(() => {
  const format = value => Number(value).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  const listingForm = document.getElementById('market-listing-form');
  if (listingForm) {
    const quantity = listingForm.querySelector('[name="quantity"]');
    const total = listingForm.querySelector('[name="priceCoins"]');
    const output = document.getElementById('market-price-preview');
    if (quantity && total && output) {
      const update = () => {
        const count = Number(quantity.value);
        const amount = Number(total.value);
        if (!Number.isSafeInteger(count) || count < 1 || count > 1000
          || !Number.isSafeInteger(amount) || amount < 1 || amount > 1000000) {
          output.textContent = '1–1.000 adet ve 1–1.000.000 altın arasında geçerli değer gir.';
          return;
        }
        output.textContent = 'Toplam: ' + format(amount) + ' altın · Birim: '
          + format(amount / count) + ' altın / adet';
      };
      quantity.addEventListener('input', update);
      total.addEventListener('input', update);
      update();
    }
  }
  document.querySelectorAll('form[action="/pazar/teklif-ver"]').forEach(form => {
    const amount = form.querySelector('[name="offerCoins"]');
    const output = form.querySelector('.market-offer-preview');
    if (!amount || !output) return;
    const update = () => {
      const value = Number(amount.value);
      if (!Number.isSafeInteger(value) || value < 1 || value > 1000000) {
        output.textContent = '1–1.000.000 altın arasında geçerli bir teklif gir.';
        return;
      }
      output.textContent = 'Gönderilecek teklif: ' + format(value)
        + ' altın · Satıcı kabul etmeden bakiyenden düşülmez.';
    };
    amount.addEventListener('input', update);
    update();
  });
})();
