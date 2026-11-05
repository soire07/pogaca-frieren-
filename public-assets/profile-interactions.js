(() => {
  const page = document.querySelector('.profile-page');
  if (!page) return;

  const achievementList = page.querySelector('#profile-achievement-list');
  const search = page.querySelector('[data-profile-achievement-search]');
  const sort = page.querySelector('[data-profile-achievement-sort]');
  const count = page.querySelector('#profile-achievement-count');
  if (achievementList && search && sort) {
    const updateAchievements = () => {
      const query = search.value.trim().toLocaleLowerCase('tr-TR');
      const rows = [...achievementList.querySelectorAll('[data-achievement-name]')];
      const visible = rows.filter(row => {
        const match = row.dataset.achievementName.includes(query);
        row.hidden = !match;
        return match;
      });
      const compare = {
        'date-desc': (a, b) => Number(b.dataset.achievementDate) - Number(a.dataset.achievementDate),
        'date-asc': (a, b) => Number(a.dataset.achievementDate) - Number(b.dataset.achievementDate),
        'reward-desc': (a, b) => Number(b.dataset.achievementReward) - Number(a.dataset.achievementReward),
        'name-asc': (a, b) => a.dataset.achievementName.localeCompare(b.dataset.achievementName, 'tr')
      }[sort.value] || (() => 0);
      visible.sort(compare).forEach(row => achievementList.appendChild(row));
      if (count) count.textContent = visible.length + ' / ' + rows.length + ' başarım';
    };
    search.addEventListener('input', updateAchievements);
    sort.addEventListener('change', updateAchievements);
    updateAchievements();
  }

  const activityList = page.querySelector('#profile-activity-list');
  const activityFilters = [...page.querySelectorAll('[data-profile-activity-filter]')];
  activityFilters.forEach(button => button.addEventListener('click', () => {
    const filter = button.dataset.profileActivityFilter;
    activityFilters.forEach(item => {
      const active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    if (activityList) activityList.querySelectorAll('li[data-activity-type]').forEach(row => {
      row.hidden = filter !== 'all' && row.dataset.activityType !== filter;
    });
  }));

  const settings = page.querySelector('#profile-settings-form');
  const previewButton = page.querySelector('#profile-preview-toggle');
  const previewNote = page.querySelector('#profile-preview-note');
  const resetButton = page.querySelector('#profile-settings-reset');
  const privacyNodes = [...page.querySelectorAll('[data-profile-privacy]')];
  const applyPreview = () => {
    if (!settings || !page.classList.contains('is-previewing')) return;
    privacyNodes.forEach(node => {
      const field = settings.elements.namedItem(node.dataset.profilePrivacy);
      node.hidden = Boolean(field && field.value !== 'true');
    });
  };
  if (previewButton) {
    previewButton.addEventListener('click', () => {
      const enabled = !page.classList.contains('is-previewing');
      page.classList.toggle('is-previewing', enabled);
      previewButton.setAttribute('aria-pressed', String(enabled));
      previewButton.textContent = enabled ? 'Önizlemeyi kapat' : 'Ziyaretçi önizlemesini aç';
      if (previewNote) previewNote.hidden = !enabled;
      if (!enabled) privacyNodes.forEach(node => { node.hidden = false; });
      else applyPreview();
    });
  }
  if (settings) settings.addEventListener('change', applyPreview);
  if (resetButton && settings) resetButton.addEventListener('click', () => {
    const defaults = {
      showStats: 'false', showAchievements: 'true', showCollections: 'true',
      showActivity: 'false', showCosmetics: 'true', activeTitle: ''
    };
    Object.entries(defaults).forEach(([name, value]) => {
      const field = settings.elements.namedItem(name);
      if (field) field.value = value;
    });
    applyPreview();
    settings.querySelector('select')?.focus();
  });
})();