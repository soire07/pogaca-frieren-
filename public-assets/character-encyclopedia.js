(() => {
  const root = document.querySelector('[data-character-encyclopedia]');
  if (!root) return;

  const search = root.querySelector('[data-character-search]');
  const anime = root.querySelector('[data-character-anime]');
  const rarity = root.querySelector('[data-character-rarity]');
  const count = root.querySelector('[data-character-count]');
  const empty = root.querySelector('[data-character-empty]');
  const cards = Array.from(root.querySelectorAll('[data-character-card]'));

  const applyFilters = () => {
    const query = String(search?.value || '').trim().toLocaleLowerCase('tr-TR');
    const selectedAnime = String(anime?.value || '');
    const selectedRarity = String(rarity?.value || '');
    let visible = 0;

    for (const card of cards) {
      const matches = (!query || String(card.dataset.search || '').includes(query)) &&
        (!selectedAnime || card.dataset.anime === selectedAnime) &&
        (!selectedRarity || card.dataset.rarity === selectedRarity);
      card.hidden = !matches;
      if (matches) visible += 1;
    }

    if (count) count.textContent = visible + ' / ' + cards.length + ' karakter';
    if (empty) empty.hidden = visible !== 0;
  };

  search?.addEventListener('input', applyFilters);
  anime?.addEventListener('change', applyFilters);
  rarity?.addEventListener('change', applyFilters);

  root.dataset.characterEncyclopediaReady = 'true';
  for (const button of root.querySelectorAll('[data-character-spoiler-toggle]')) {
    button.addEventListener('click', () => {
      const card = button.closest('[data-character-card]');
      const details = card?.querySelector('[data-character-spoiler]');
      if (!details) return;
      details.hidden = !details.hidden;
      button.setAttribute('aria-expanded', String(!details.hidden));
      button.textContent = details.hidden ? 'Gizli bilgileri göster' : 'Gizli bilgileri gizle';
    });
  }

  applyFilters();
})();
