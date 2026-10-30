const SENSITIVE_PATTERNS = [
  /\b(?:password|passcode|parola|sifre|token|secret|api key|iban)\w*\b/,
  /\b(?:credit card|kredi kart)\w*\b/,
  /\b(?:ev )?adres\w*\b/,
  /\b(?:home address|address|phone number|mobile number)\w*\b/,
  /\btelefon(?: numara)?\w*\b/,
  /\btc kimlik(?: numara)?\w*\b/,
  /\bpasaport\w*\b/,
  /\b(?:diagnos\w*|tani kondu|tani aldim|hastali\w*|rahatsizli\w*|depresyon\w*|depression\w*|anksiyete\w*|anxiety\w*|panik atak|bipolar\w*|diyabet\w*|diabetes\w*|seker hastali\w*|kanser\w*|cancer\w*|epilepsi\w*|epilepsy\w*|astim\w*|asthma\w*|hiv\b|hepatit\w*|ilac\w*|tedavi\w*|treatment\w*|terapi\w*|therapy\w*|psikiyatri\w*|psikolog\w*|hamile\w*|pregnant|gebelik\w*|pregnancy|otizm\w*|autism\w*|adhd\b|illness\w*|medication\w*|medical condition|health condition)\b/,
  /\b(?:oyum|oy verdim|oy kullan\w*|partim|partiye uye\w*|siyasi gorus|politik gorus|political affiliation|i voted|vote for|political party|political views)\b/,
  /\b(?:dinim|dini inanc\w*|inancim|mezhebim|dini gorus|religion|religious affiliation)\b/,
  /\b(?:cinsel yonelim|cinsel hayat|cinsel yasam|cinsel tercihim|sexual orientation|sexual life|sex life|lezbiyen\w*|lesbian\w*|escinsel\w*|homosexual\w*|biseksuel\w*|bisexual\w*|gayim|geyim|i am gay|trans birey|transgender\w*)\b/,
  /\b(?:etnik koken|irkim|irki kimlik|race|ethnicity)\b/,
  /\b(?:suc kaydim|sabikam|criminal record)\b/,
];

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeSensitiveText(value) {
  return clean(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function containsSensitiveInformation(value) {
  const normalized = normalizeSensitiveText(value);
  return Boolean(normalized) && SENSITIVE_PATTERNS.some(pattern => pattern.test(normalized));
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
  if (text.length < 8 || text.length > 500 || /[?؟]/u.test(text) || containsSensitiveInformation(text)) return [];

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
      const isGameCorrection = category === 'oyun'
        && /\b(?:artık|bundan sonra|yerine|eskisini|güncelle|değişti)\b/iu.test(text);
      if (isGameCorrection) add('tercih_oyun', 'Kullanıcı ' + value + ' oynamayı seviyor.');
    }
  }

  const favoriteCharacter = text.match(/\b(?:benim\s+)?favori\s+karakterim\s+(.+?)(?=[,.!?]|$)/iu);
  if (favoriteCharacter) {
    const value = clean(favoriteCharacter[1]).replace(/[.!]+$/u, '');
    if (value && value.length <= 120) add('favori_karakter', 'En sevdiği karakter: ' + value + '.');
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

  const hasStorySignal = /\b(hikaye|hikâye|karakter|ejderha|orman|rpg|gölge|golge|elara)\b/iu.test(text);
  const hasNamedStoryTerms = /\b(elara|gölge|golge)\b/iu.test(text);
  if (hasStorySignal && hasNamedStoryTerms && text.length >= 25 && text.length <= 350) {
    const namedTerm = (text.match(/\b(Elara|Gölge|Golge)\b/iu) || [,'hikaye'])[1];
    add('hikaye_baglam_' + slug(namedTerm), text);
  }

  return facts.slice(0, 3);
}

export function isExplicitMemorySaveRequest(message) {
  const normalized = normalizeSensitiveText(message);
  return /\b(?:bunu )?(?:kalici )?belleg(?:ine|e) kaydet\b/.test(normalized)
    || /\b(?:bunu )?hafizana kaydet\b/.test(normalized);
}

export const memoryExtractorInternals = { clean, slug, normalizeFact, normalizeSensitiveText };
