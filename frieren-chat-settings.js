const OWNER_ID_PATTERN = /^\d{17,20}$/;

export const DEFAULT_FRIEREN_CHAT_SETTINGS = Object.freeze({
  enabled: true,
  style: 'calm',
  responseLength: 'concise',
  loreFocus: true
});

const STYLES = new Set(['calm', 'warm', 'witty', 'formal']);
const LENGTHS = new Set(['concise', 'balanced', 'detailed']);

export function normalizeFrierenChatSettings(value = {}) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULT_FRIEREN_CHAT_SETTINGS.enabled,
    style: STYLES.has(input.style) ? input.style : DEFAULT_FRIEREN_CHAT_SETTINGS.style,
    responseLength: LENGTHS.has(input.responseLength) ? input.responseLength : DEFAULT_FRIEREN_CHAT_SETTINGS.responseLength,
    loreFocus: typeof input.loreFocus === 'boolean' ? input.loreFocus : DEFAULT_FRIEREN_CHAT_SETTINGS.loreFocus
  };
}

export async function getFrierenChatSettings(db) {
  const result = await db.query(
    'SELECT setting_value FROM owner_settings WHERE setting_key=$1 LIMIT 1',
    ['frieren_chat_settings']
  );
  return normalizeFrierenChatSettings(result.rows?.[0]?.setting_value);
}

export async function updateFrierenChatSettings(db, settings, actorId) {
  const actor = String(actorId || '');
  if (!OWNER_ID_PATTERN.test(actor)) throw new Error('INVALID_OWNER_ACTOR');
  if (!settings || typeof settings.enabled !== 'boolean' || typeof settings.loreFocus !== 'boolean' ||
      !STYLES.has(settings.style) || !LENGTHS.has(settings.responseLength)) {
    throw new Error('INVALID_FRIEREN_CHAT_SETTINGS');
  }
  const normalized = normalizeFrierenChatSettings(settings);
  const result = await db.query(
    `WITH saved AS (
       INSERT INTO owner_settings(setting_key,setting_value,updated_by)
       VALUES('frieren_chat_settings',$1::jsonb,$2)
       ON CONFLICT(setting_key) DO UPDATE
         SET setting_value=EXCLUDED.setting_value,updated_by=EXCLUDED.updated_by,updated_at=NOW()
       RETURNING setting_value
     ), logged AS (
       INSERT INTO owner_audit_logs(actor_id,action,target,details)
       SELECT $2,'frieren.chat.settings.update','frieren_chat_settings',setting_value FROM saved
       RETURNING id
     )
     SELECT saved.setting_value FROM saved JOIN logged ON TRUE`,
    [JSON.stringify(normalized), actor]
  );
  return normalizeFrierenChatSettings(result.rows?.[0]?.setting_value || normalized);
}
