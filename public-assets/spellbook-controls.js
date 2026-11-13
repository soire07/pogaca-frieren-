(() => {
  const root = document.querySelector('[data-spellbook]');
  if (!root) return;
  const search = root.querySelector('[data-spellbook-filter]');
  const mastery = root.querySelector('[data-spellbook-mastery]');
  const count = root.querySelector('[data-spellbook-count]');
  const empty = root.querySelector('[data-spellbook-empty]');
  const entries = [...root.querySelectorAll('[data-spellbook-entry]')];

  const applyFilters = () => {
    const query = String(search?.value || '').trim().toLocaleLowerCase('tr-TR');
    const selectedMastery = String(mastery?.value || '');
    let visible = 0;
    for (const entry of entries) {
      const matchesQuery = !query || String(entry.dataset.search || '').includes(query);
      const level = Math.max(0, Number(entry.dataset.mastery) || 0);
      const matchesMastery = !selectedMastery ||
        (selectedMastery === '3' ? level >= 3 : level === Number(selectedMastery));
      entry.hidden = !(matchesQuery && matchesMastery);
      if (!entry.hidden) visible += 1;
    }
    if (count) count.textContent = visible + ' / ' + entries.length + ' büyü';
    if (empty) empty.hidden = entries.length === 0 || visible !== 0;
  };

  search?.addEventListener('input', applyFilters);
  mastery?.addEventListener('change', applyFilters);
  root.dataset.spellbookReady = 'true';
  applyFilters();
})();