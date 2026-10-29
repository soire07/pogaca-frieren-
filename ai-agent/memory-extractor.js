const SENSITIVE_TERMS = /\b(password|passcode|parola|sifre|şifre|token|api key|secret|iban|credit card|kredi karti|adresim|ev adresi|telefon numaram|tc kimlik|diagnosis|tani kondu|hastaligim|hastalığım|ilacim|ilacım|oyum|partim|dinim|cinsel|sexual|political affiliation)\b/i;

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function slug(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('tr-TR').replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}

/**
 * Conservative, local-only extraction. It saves only clear declarative facts;
 * questions, sensitive-looking messages, and arbitrary chat are ignored.
 */
export function extractAutomaticMemories(message) {
  const text = clean(message);
  if (text.length < 8 || text.length > 500 || /\?/.test(text) || SENSITIVE_TERMS.test(text)) return [];
  const facts = [];
  const add = (key, value) => {
    const safeKey = slug(key);
    const safeValue = clean(value);
    if (safeKey && safeValue && safeValue.length <= 500 && !facts.some(f => f.key === safeKey)) {
      facts.push({ key: safeKey, value: safeValue });
    }
  };

  const favorite = text.match(/\ben sevdiğim\s+(renk|oyun|karakter|yemek|müzik|sarki|şarkı|anime|dizi|film|kitap|hayvan)\s+(?:ise\s+)?(.+?)[.!]?$/i);
  if (favorite) {
    const category = slug(favorite[1]);
    const value = clean(favorite[2]).replace(/[.!]+$/, '');
    if (value && value.length <= 120) add('favori_' + category, 'En sevdiği ' + category.replace(/_/g, ' ') + ': ' + value + '.');
  }

  const name = text.match(/\b(?:benim adım|adım)\s+([\p{L}][\p{L}'’-]{1,40})\b/iu);
  if (name) add('kullanici_adi', 'Kullanıcının adı: ' + name[1] + '.');

  const preference = text.match(/\b(?:ben|benim)\s+([\p{L}][\p{L} -]{1,35}?)\s+(seviyorum|seviyorum ya da|hoşlanıyorum|hoslaniyorum|tercih ediyorum)\b/i);
  if (preference) add('tercih_' + preference[2].replace(/\s+/g, '_'), 'Kullanıcı şunu sevdiğini/tercih ettiğini belirtti: ' + preference[1].trim() + '.');

  // Preserve explicit ongoing fictional/story context without storing every chat line.
  const hasStorySignal = /\b(hikaye|hikâye|karakter|ejderha|orman|rpg|gölge|golge|elara)\b/i.test(text);
  const hasNamedStoryTerms = /\b(elara|gölge|golge)\b/i.test(text);
  if (hasStorySignal && hasNamedStoryTerms && text.length >= 25 && text.length <= 350) {
    add('hikaye_baglam_' + slug((text.match(/\b(Elara|Gölge|Golge)\b/i) || [,'hikaye'])[1]), text);
  }
  return facts.slice(0, 3);
}

export const memoryExtractorInternals = { clean, slug };
