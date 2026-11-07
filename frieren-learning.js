import { createHash } from 'node:crypto';

const MAX_LEARNED_FACT_LENGTH = 300;
const SENSITIVE_INFORMATION = /(password|passcode|parola|şifre|sifre|token|api[\\s_-]*key|secret|iban|credit[\\s_-]*card|kredi[\\s_-]*kart|adresim|ev adres|telefon numara|tc kimlik|hastal|ilaç|ilac|oyum|partim|dinim|cinsel|sexual|political affiliation)/iu;

function clean(value) {
  return String(value ?? '').replace(/\\s+/g, ' ').trim();
}

function normalizeFact(value) {
  return clean(value).toLocaleLowerCase('tr-TR').normalize('NFKC');
}

function memoryKey(fact) {
  return 'learned_' + createHash('sha256').update(normalizeFact(fact), 'utf8').digest('hex').slice(0, 24);
}

/**
 * Only explicit, user-directed learning requests are persisted.
 * Arbitrary conversation text is never promoted to durable memory.
 */
export function parseFrierenLearningCommand(message) {
  const text = clean(message);
  if (/^(?:tüm|butun|bütün) (?:kişisel )?belleğimi sil$/iu.test(text)) {
    return { action: 'clear' };
  }

  const save = text.match(/^(?:bunu|şunu)\\s+(?:hatırla|öğren)(?:\\s*[:：]\\s*|\\s+)(.+)$/iu);
  if (save) {
    const fact = clean(save[1]);
    if (fact.length < 8 || fact.length > MAX_LEARNED_FACT_LENGTH) return { action: 'rejected', reason: 'length' };
    if (SENSITIVE_INFORMATION.test(fact)) return { action: 'rejected', reason: 'sensitive' };
    return { action: 'save', fact };
  }

  const forget = text.match(/^(?:bunu|şunu)\\s+unut(?:\\s*[:：]\\s*|\\s+)(.+)$/iu);
  if (forget) {
    const fact = clean(forget[1]);
    if (fact.length < 8 || fact.length > MAX_LEARNED_FACT_LENGTH) return { action: 'rejected', reason: 'length' };
    return { action: 'forget', fact };
  }

  return null;
}

export async function handleFrierenLearningCommand(db, { guildId, userId, message }) {
  const command = parseFrierenLearningCommand(message);
  if (!command) return null;

  const scope = [String(guildId), String(userId)];
  if (command.action === 'rejected') {
    return {
      handled: true,
      reply: command.reason === 'sensitive'
        ? 'Gizli veya hassas bilgileri kalıcı belleğime kaydetmiyorum.'
        : 'Hatırlamamı istediğin bilgi 8–300 karakter arasında olmalı.'
    };
  }

  if (command.action === 'save') {
    await db.query(
      `INSERT INTO frieren_chat_memories (guild_id,user_id,memory_key,memory_value)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (guild_id,user_id,memory_key)
       DO UPDATE SET memory_value=EXCLUDED.memory_value, updated_at=NOW()`,
      [...scope, memoryKey(command.fact), 'Kullanıcının özellikle hatırlatmak istediği bilgi: ' + command.fact]
    );
    return { handled: true, reply: 'Bunu yalnızca bu sunucudaki kişisel belleğine kaydettim.' };
  }

  if (command.action === 'forget') {
    const result = await db.query(
      'DELETE FROM frieren_chat_memories WHERE guild_id=$1 AND user_id=$2 AND memory_key=$3',
      [...scope, memoryKey(command.fact)]
    );
    return {
      handled: true,
      reply: result.rowCount > 0 ? 'Bu bilgiyi kişisel belleğinden sildim.' : 'Bu bilgi kişisel belleğinde kayıtlı değildi.'
    };
  }

  const result = await db.query(
    'DELETE FROM frieren_chat_memories WHERE guild_id=$1 AND user_id=$2',
    scope
  );
  return {
    handled: true,
    reply: 'Bu sunucudaki kişisel belleğini temizledim (' + Number(result.rowCount || 0) + ' kayıt).'
  };
}
