import { characters } from './character-data.js';

export const CARD_VARIANTS = Object.freeze([
  { key:'standard', label:'Standart Baskı', weight:85, color:0x9b8cff, frame:'Klasik' },
  { key:'festival', label:'Festival Baskısı', weight:6, color:0xe6a85c, frame:'Festival' },
  { key:'winter', label:'Kış Büyüsü Baskısı', weight:5, color:0x75bde8, frame:'Kış' },
  { key:'mage_exam', label:'Büyü Sınavı Baskısı', weight:3, color:0x8d79d6, frame:'Büyü Sınavı' },
  { key:'celestial', label:'Göksel Baskı', weight:1, color:0xf0d58a, frame:'Göksel' }
]);
const DISCORD_ID=/^\d{17,20}$/;
const variantByKey=new Map(CARD_VARIANTS.map(item=>[item.key,item]));

export function pickCardVariant(random=Math.random) {
  const value=Number(random());
  if(!Number.isFinite(value)||value<0||value>=1) throw new Error('CARD_VARIANT_RANDOM_INVALID');
  let cursor=value*100;
  for(const variant of CARD_VARIANTS){cursor-=variant.weight;if(cursor<variant.weight*0+0)return variant;}
  return CARD_VARIANTS[0];
}

export function getCardVariant(key) {
  return variantByKey.get(String(key||'')) || CARD_VARIANTS[0];
}

export async function ensureCardVariantSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS anime_character_card_variants (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      character_name VARCHAR(100) NOT NULL,
      series_name VARCHAR(160) NOT NULL,
      variant_key VARCHAR(32) NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
      first_obtained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_obtained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(guild_id,user_id,character_name,variant_key),
      FOREIGN KEY(guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS anime_card_variants_user_idx
      ON anime_character_card_variants(guild_id,user_id,series_name,variant_key);
  `);
}

export async function saveCardVariant(db,{guildId,userId,characterName,variantKey}) {
  if(!DISCORD_ID.test(String(guildId||''))||!DISCORD_ID.test(String(userId||''))) throw new Error('CARD_VARIANT_PLAYER_INVALID');
  const character=characters.find(item=>item.name===characterName);
  if(!character) throw new Error('CARD_VARIANT_CHARACTER_INVALID');
  const variant=variantByKey.get(String(variantKey||''));
  if(!variant) throw new Error('CARD_VARIANT_KEY_INVALID');
  const result=await db.query(
    `INSERT INTO anime_character_card_variants(guild_id,user_id,character_name,series_name,variant_key)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(guild_id,user_id,character_name,variant_key)
     DO UPDATE SET quantity=anime_character_card_variants.quantity+1,last_obtained_at=NOW()
     RETURNING quantity`,
    [guildId,userId,character.name,character.anime,variant.key]
  );
  return {quantity:Number(result.rows[0]?.quantity||1),variant};
}

export async function listCardVariants(db,guildId,userId,seriesName=null) {
  if(!DISCORD_ID.test(String(guildId||''))||!DISCORD_ID.test(String(userId||''))) throw new Error('CARD_VARIANT_PLAYER_INVALID');
  const result=await db.query(
    `SELECT character_name,series_name,variant_key,quantity,first_obtained_at,last_obtained_at
     FROM anime_character_card_variants
     WHERE guild_id=$1 AND user_id=$2 AND ($3::text IS NULL OR series_name=$3)
     ORDER BY series_name,character_name,variant_key`,
    [guildId,userId,seriesName]
  );
  return result.rows.map(row=>({...row,variant:getCardVariant(row.variant_key)}));
}
