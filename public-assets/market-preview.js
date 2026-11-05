(() => {
  const form = document.getElementById('market-listing-form');
  const quantity = form?.querySelector('[name="quantity"]');
  const total = form?.querySelector('[name="priceCoins"]');
  const output = document.getElementById('market-price-preview');
  if (!form || !quantity || !total || !output) return;

  const format = value => Number(value).toLocaleString('tr-TR', {
    maximumFractionDigits: 2
  });
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
})();
