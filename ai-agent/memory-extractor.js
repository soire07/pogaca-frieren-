const SENSITIVE_TERMS = /(password|passcode|parola|sifre|şifre|token|api[\s_-]*key|secret|iban|credit[\s_-]*card|kredi[\s_-]*kart|adresim|ev adres|telefon numara|tc kimlik|diagnosis|tanı kondu|hastalığım|hastaligim|ilacım|ilacim|oyum|partim|dinim|cinsel|sexual|political affiliation)/iu;

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function slug(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('tr-TR').replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}

function normalizeFact(value) {
  return clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('tr-TR').replace(/ı/g, 'i')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * Conservative, local-only extraction. Saves only explicit declarative facts;
 * questions, sensitive-looking messages, and casual mentions are ignored.
 * No additional AI/API request is made for extraction.
 */
export function extractAutomaticMemories(message) {
  const text = clean(message);
  if (text.length < 8 || text.length > 500 || /[?؟]/u.test(text) || SENSITIVE_TERMS.test(text)) return [];

  const facts = [];
  const add = (key, value) => {
    const safeKey = slug(key);
    const safeValue = clean(value);
    if (!safeKey || !safeValue || safeValue.length > 500) return;
    if (facts.some(fact => fact.key === safeKey || normalizeFact(fact.value) === normalizeFact(safeValue))) return;
    facts.push({ key: safeKey, value: safeValue });
  };

  // Capture only the declarative fact before the first sentence boundary. This prevents
  // follow-up instructions such as "bunu kaydet ve eskisini güncelle" entering the value.
  const favorite = text.match(/\ben sevdiğim\s+(renk|oyun|karakter|yemek|müzik|sarki|şarkı|anime|dizi|film|kitap|hayvan)\s+(?:ise\s+)?(.+?)(?=[.!?]|$)/iu);
  if (favorite) {
    const category = slug(favorite[1]);
    const value = clean(favorite[2]).replace(/^(?:artık|bundan sonra|şimdi)\s+/iu, '').replace(/[.!]+$/u, '');
    if (value && value.length <= 120) {
      add('favori_' + category, 'En sevdiği ' + category.replace(/_/g, ' ') + ': ' + value + '.');
      // A correction to the favorite game must also replace the normalized play-preference
      // record; otherwise the two memory keys contradict each other on later recall.
      const isGameCorrection = category === 'oyun'
        && /\b(?:artık|bundan sonra|yerine|eskisini|güncelle|değişti)\b/iu.test(text);
      if (isGameCorrection) add('tercih_oyun', 'Kullanıcı ' + value + ' oynamayı seviyor.');
    }
  }

  const name = text.match(/\b(?:benim adım|adım)\s+([\p{L}][\p{L}'’-]{1,40})\b/iu);
  if (name) add('kullanici_adi', 'Kullanıcının adı: ' + name[1] + '.');

  const gamePreference = text.match(/^(?:ben\s+)?(.{2,80}?)\s+oynamayı\s+seviyorum[.!]?$/iu);
  if (gamePreference) {
    const game = clean(gamePreference[1]).replace(/[.!]+$/u, '');
    if (game && !/^(çok|cok|bazen|her zaman)$/iu.test(game)) {
      add('tercih_oyun', 'Kullanıcı ' + game + ' oynamayı seviyor.');
    }
  }

  const hobby = text.match(/^(?:benim\s+)?hobim\s+(.{2,100})[.!]?$/iu);
  if (hobby) {
    const value = clean(hobby[1]).replace(/[.!]+$/u, '');
    add('hobi', 'Kullanıcının hobisi: ' + value + '.');
  }

  const project = text.match(/^(?:(?:şu sıralar|şu anda|bu aralar|şimdi)\s+)?(.{2,70}?)\s+üzerinde çalışıyorum[.!]?$/iu);
  if (project) {
    const projectName = clean(project[1]).replace(/[.!]+$/u, '');
    if (projectName && !/^(?:bir şey|birsey|bunun|şey|sey)$/iu.test(projectName)) {
      add('proje_' + slug(projectName).slice(0, 45), 'Kullanıcı şu proje üzerinde çalışıyor: ' + projectName + '.');
    }
  }

  const goal = text.match(/^hedefim\s+(.{2,160})[.!]?$/iu);
  if (goal) {
    const value = clean(goal[1]).replace(/[.!]+$/u, '');
    add('hedef', 'Kullanıcının hedefi: ' + value + '.');
  }

  // Preserve explicit ongoing fictional/story context without storing every chat line.
  const hasStorySignal = /\b(hikaye|hikâye|karakter|ejderha|orman|rpg|gölge|golge|elara)\b/iu.test(text);
  const hasNamedStoryTerms = /\b(elara|gölge|golge)\b/iu.test(text);
  if (hasStorySignal && hasNamedStoryTerms && text.length >= 25 && text.length <= 350) {
    const namedTerm = (text.match(/\b(Elara|Gölge|Golge)\b/iu) || [,'hikaye'])[1];
    add('hikaye_baglam_' + slug(namedTerm), text);
  }

  return facts.slice(0, 3);
}

export const memoryExtractorInternals = { clean, slug, normalizeFact };
