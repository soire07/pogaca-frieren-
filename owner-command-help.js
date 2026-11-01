import { containsSensitiveInformation } from './ai-agent/memory-extractor.js';

export const COMMAND_SHORT_DESCRIPTION_MAX = 100;
export const COMMAND_LONG_DESCRIPTION_MAX = 2000;
const NAME_PATTERN = /^[a-z0-9-]{1,32}$/;

export function validateOwnerCommandHelp(input = {}) {
  const commandName=String(input.commandName||'').trim();
  const shortDescription=String(input.shortDescription||'').trim();
  const longDescription=String(input.longDescription||'').trim();
  if(!NAME_PATTERN.test(commandName)) throw new Error('INVALID_COMMAND_HELP_NAME');
  if(!shortDescription||shortDescription.length>COMMAND_SHORT_DESCRIPTION_MAX) throw new Error('INVALID_COMMAND_SHORT_DESCRIPTION');
  if(!longDescription||longDescription.length>COMMAND_LONG_DESCRIPTION_MAX) throw new Error('INVALID_COMMAND_LONG_DESCRIPTION');
  if(containsSensitiveInformation(shortDescription)||containsSensitiveInformation(longDescription)) throw new Error('SENSITIVE_COMMAND_HELP_REJECTED');
  return {commandName,shortDescription,longDescription};
}

export async function initOwnerCommandHelpSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS owner_command_help (
      command_name VARCHAR(32) PRIMARY KEY,
      short_description VARCHAR(100) NOT NULL,
      long_description VARCHAR(2000) NOT NULL,
      updated_by TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS owner_command_help_versions (
      id BIGSERIAL PRIMARY KEY,
      command_name VARCHAR(32) NOT NULL,
      short_description VARCHAR(100) NOT NULL,
      long_description VARCHAR(2000) NOT NULL,
      actor_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_owner_command_help_versions_recent ON owner_command_help_versions(command_name,created_at DESC);
  `);
}

export async function listOwnerCommandHelp(db) {
  const result=await db.query(`
    SELECT h.command_name,h.short_description,h.long_description,h.updated_by,h.updated_at,
      (SELECT COUNT(*)::int FROM owner_command_help_versions v WHERE v.command_name=h.command_name) AS version_count
    FROM owner_command_help h ORDER BY h.command_name
  `);
  return result.rows||[];
}

export async function saveOwnerCommandHelp(db,input={}) {
  const value=validateOwnerCommandHelp(input);
  const actorId=String(input.actorId||'').trim();
  if(!/^\\d{17,20}$/.test(actorId)) throw new Error('INVALID_COMMAND_HELP_ACTOR');
  const connection=typeof db.connect==='function'?await db.connect():db;
  const ownsConnection=connection!==db;
  try {
    await connection.query('BEGIN');
    await connection.query('INSERT INTO owner_command_help_versions(command_name,short_description,long_description,actor_id) VALUES($1,$2,$3,$4)',[value.commandName,value.shortDescription,value.longDescription,actorId]);
    await connection.query(`
      INSERT INTO owner_command_help(command_name,short_description,long_description,updated_by,updated_at)
      VALUES($1,$2,$3,$4,NOW())
      ON CONFLICT(command_name) DO UPDATE SET short_description=EXCLUDED.short_description,long_description=EXCLUDED.long_description,updated_by=EXCLUDED.updated_by,updated_at=NOW()
    `,[value.commandName,value.shortDescription,value.longDescription,actorId]);
    await connection.query(`
      DELETE FROM owner_command_help_versions WHERE command_name=$1 AND id NOT IN (
        SELECT id FROM owner_command_help_versions WHERE command_name=$1 ORDER BY created_at DESC,id DESC LIMIT 30
      )
    `,[value.commandName]);
    await connection.query('COMMIT');
    return {...value,updatedBy:actorId};
  } catch(error) {
    await connection.query('ROLLBACK').catch(()=>{});
    throw error;
  } finally { if(ownsConnection) connection.release(); }
}
