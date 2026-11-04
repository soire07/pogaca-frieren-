import { randomUUID } from 'node:crypto';
import { EmbedBuilder } from 'discord.js';

const DISCORD_ID=/^\d{17,20}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ELEMENTS=new Set(['fire','ice','wind','light','shadow']);
const TRIGGERS=new Set(['event_reminder','custom_spell']);

function requiredText(value,min,max,error) {
  const text=String(value||'').trim();
  if(text.length<min||text.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new Error(error);
  return text;
}
function validateGuild(guildId,creatorId) {
  if(!DISCORD_ID.test(String(guildId||''))||!DISCORD_ID.test(String(creatorId||''))) throw new Error('GUILD_WORKSHOP_ID_INVALID');
}

export function normalizeGuildEmbedTemplate(input={}) {
  const name=requiredText(input.name,2,40,'GUILD_EMBED_NAME_INVALID');
  const title=requiredText(input.title,1,256,'GUILD_EMBED_TITLE_INVALID');
  const description=requiredText(input.description,1,4000,'GUILD_EMBED_DESCRIPTION_INVALID');
  const rawColor=String(input.color||'').trim().replace(/^#/,'');
  if(!/^[0-9a-f]{6}$/i.test(rawColor)) throw new Error('GUILD_EMBED_COLOR_INVALID');
  const footer=String(input.footer||'').trim();
  if(footer.length>2048) throw new Error('GUILD_EMBED_FOOTER_INVALID');
  const fields=Array.isArray(input.fields)?input.fields:[];
  if(fields.length>5) throw new Error('GUILD_EMBED_FIELDS_INVALID');
  const normalizedFields=fields.map(field=>({
    name:requiredText(field?.name,1,256,'GUILD_EMBED_FIELD_NAME_INVALID'),
    value:requiredText(field?.value,1,1024,'GUILD_EMBED_FIELD_VALUE_INVALID'),
    inline:Boolean(field?.inline)
  }));
  return {name,title,description,color:parseInt(rawColor,16),footer,fields:normalizedFields};
}

export function normalizeGuildCustomCommand(input={}) {
  const triggerName=String(input.triggerName||'').trim().toLowerCase();
  if(!/^[a-z0-9_-]{2,32}$/.test(triggerName)) throw new Error('GUILD_CUSTOM_COMMAND_NAME_INVALID');
  const kind=String(input.kind||'command');
  if(!['command','spell'].includes(kind)) throw new Error('GUILD_CUSTOM_COMMAND_KIND_INVALID');
  const responseText=requiredText(input.responseText,1,1800,'GUILD_CUSTOM_COMMAND_RESPONSE_INVALID');
  if(kind==='command') return {triggerName,kind,responseText,element:null,manaCost:null,power:null};
  const element=String(input.element||'');
  if(!ELEMENTS.has(element)) throw new Error('GUILD_CUSTOM_SPELL_ELEMENT_INVALID');
  const manaCost=Number(input.manaCost),power=Number(input.power);
  if(!Number.isInteger(manaCost)||manaCost<1||manaCost>100) throw new Error('GUILD_CUSTOM_SPELL_MANA_INVALID');
  if(!Number.isInteger(power)||power<1||power>300) throw new Error('GUILD_CUSTOM_SPELL_POWER_INVALID');
  return {triggerName,kind,responseText,element,manaCost,power};
}

export function normalizeGuildSpellAutomation(input={}) {
  const name=requiredText(input.name,2,48,'GUILD_AUTOMATION_NAME_INVALID');
  const triggerKey=String(input.triggerKey||'');
  if(!TRIGGERS.has(triggerKey)) throw new Error('GUILD_AUTOMATION_TRIGGER_INVALID');
  const channelId=String(input.channelId||'');
  if(!DISCORD_ID.test(channelId)) throw new Error('GUILD_AUTOMATION_CHANNEL_INVALID');
  const message=requiredText(input.message,1,1800,'GUILD_AUTOMATION_MESSAGE_INVALID');
  const templateId=input.templateId?String(input.templateId):null;
  if(templateId&&!UUID.test(templateId)) throw new Error('GUILD_AUTOMATION_TEMPLATE_INVALID');
  const cooldownSeconds=Number(input.cooldownSeconds??60);
  if(!Number.isInteger(cooldownSeconds)||cooldownSeconds<30||cooldownSeconds>3600) throw new Error('GUILD_AUTOMATION_COOLDOWN_INVALID');
  return {name,triggerKey,channelId,message,templateId,cooldownSeconds};
}

export async function ensureGuildWorkshopSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS guild_embed_templates (
      template_id UUID PRIMARY KEY,
      guild_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      name VARCHAR(40) NOT NULL,
      title VARCHAR(256) NOT NULL,
      description VARCHAR(4000) NOT NULL,
      color INTEGER NOT NULL,
      footer VARCHAR(2048) NOT NULL DEFAULT '',
      fields JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id,name)
    );
    CREATE TABLE IF NOT EXISTS guild_custom_commands (
      command_id UUID PRIMARY KEY,
      guild_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      trigger_name VARCHAR(32) NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('command','spell')),
      response_text VARCHAR(1800) NOT NULL,
      element TEXT,
      mana_cost INTEGER,
      power INTEGER,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id,trigger_name),
      CHECK ((kind='command' AND element IS NULL AND mana_cost IS NULL AND power IS NULL) OR
             (kind='spell' AND element IN ('fire','ice','wind','light','shadow') AND mana_cost BETWEEN 1 AND 100 AND power BETWEEN 1 AND 300))
    );
    CREATE TABLE IF NOT EXISTS guild_spell_automations (
      automation_id UUID PRIMARY KEY,
      guild_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      name VARCHAR(48) NOT NULL,
      trigger_key TEXT NOT NULL CHECK(trigger_key IN ('event_reminder','custom_spell')),
      channel_id TEXT NOT NULL,
      message VARCHAR(1800) NOT NULL,
      template_id UUID REFERENCES guild_embed_templates(template_id) ON DELETE SET NULL,
      cooldown_seconds INTEGER NOT NULL DEFAULT 60 CHECK(cooldown_seconds BETWEEN 30 AND 3600),
      last_triggered_at TIMESTAMPTZ,
      claimed_at TIMESTAMPTZ,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id,trigger_key,name)
    );
    ALTER TABLE guild_spell_automations ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS guild_spell_automations_due_idx
      ON guild_spell_automations(guild_id,trigger_key,last_triggered_at) WHERE enabled=TRUE;
  `);
}

export async function saveGuildEmbedTemplate(db,{guildId,creatorId,template}) {
  validateGuild(guildId,creatorId);
  const value=normalizeGuildEmbedTemplate(template);
  const result=await db.query(
    `INSERT INTO guild_embed_templates(template_id,guild_id,creator_id,name,title,description,color,footer,fields)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
     ON CONFLICT(guild_id,name) DO UPDATE SET creator_id=EXCLUDED.creator_id,title=EXCLUDED.title,
       description=EXCLUDED.description,color=EXCLUDED.color,footer=EXCLUDED.footer,fields=EXCLUDED.fields,updated_at=NOW()
     RETURNING template_id,name,title,description,color,footer,fields`,
    [randomUUID(),guildId,creatorId,value.name,value.title,value.description,value.color,value.footer,JSON.stringify(value.fields)]
  );
  return result.rows[0];
}

export async function listGuildEmbedTemplates(db,guildId) {
  const result=await db.query('SELECT template_id,name,title,description,color,footer,fields FROM guild_embed_templates WHERE guild_id=$1 ORDER BY updated_at DESC LIMIT 20',[guildId]);
  return result.rows;
}

export async function saveGuildCustomCommand(db,{guildId,creatorId,command}) {
  validateGuild(guildId,creatorId);
  const value=normalizeGuildCustomCommand(command);
  const result=await db.query(
    `INSERT INTO guild_custom_commands(command_id,guild_id,creator_id,trigger_name,kind,response_text,element,mana_cost,power)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT(guild_id,trigger_name) DO UPDATE SET creator_id=EXCLUDED.creator_id,kind=EXCLUDED.kind,
       response_text=EXCLUDED.response_text,element=EXCLUDED.element,mana_cost=EXCLUDED.mana_cost,power=EXCLUDED.power,
       enabled=TRUE,updated_at=NOW()
     RETURNING command_id,trigger_name,kind,response_text,element,mana_cost,power,enabled`,
    [randomUUID(),guildId,creatorId,value.triggerName,value.kind,value.responseText,value.element,value.manaCost,value.power]
  );
  return result.rows[0];
}

export async function getGuildCustomCommand(db,guildId,triggerName) {
  const name=String(triggerName||'').trim().toLowerCase();
  if(!/^[a-z0-9_-]{2,32}$/.test(name)) return null;
  const result=await db.query(
    'SELECT command_id,trigger_name,kind,response_text,element,mana_cost,power FROM guild_custom_commands WHERE guild_id=$1 AND trigger_name=$2 AND enabled=TRUE LIMIT 1',
    [guildId,name]
  );
  return result.rows[0]||null;
}

export async function listGuildCustomCommands(db,guildId) {
  const result=await db.query('SELECT command_id,trigger_name,kind,element,mana_cost,power,enabled FROM guild_custom_commands WHERE guild_id=$1 ORDER BY trigger_name LIMIT 30',[guildId]);
  return result.rows;
}

export async function saveGuildSpellAutomation(db,{guildId,creatorId,rule}) {
  validateGuild(guildId,creatorId);
  const value=normalizeGuildSpellAutomation(rule);
  const result=await db.query(
    `INSERT INTO guild_spell_automations(automation_id,guild_id,creator_id,name,trigger_key,channel_id,message,template_id,cooldown_seconds)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT(guild_id,trigger_key,name) DO UPDATE SET creator_id=EXCLUDED.creator_id,channel_id=EXCLUDED.channel_id,
       message=EXCLUDED.message,template_id=EXCLUDED.template_id,cooldown_seconds=EXCLUDED.cooldown_seconds,
       enabled=TRUE,updated_at=NOW()
     RETURNING automation_id,name,trigger_key,channel_id,message,template_id,cooldown_seconds,enabled`,
    [randomUUID(),guildId,creatorId,value.name,value.triggerKey,value.channelId,value.message,value.templateId,value.cooldownSeconds]
  );
  return result.rows[0];
}

export async function listGuildSpellAutomations(db,guildId) {
  const result=await db.query('SELECT automation_id,name,trigger_key,channel_id,message,template_id,cooldown_seconds,enabled FROM guild_spell_automations WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 30',[guildId]);
  return result.rows;
}

export async function runGuildSpellAutomations(db,client,guildId,triggerKey,context={}) {
  if(!TRIGGERS.has(triggerKey)||!DISCORD_ID.test(String(guildId||''))) return {sent:0,skipped:0};
  const claimed=await db.query(
    `WITH due AS (
       SELECT automation_id FROM guild_spell_automations
       WHERE guild_id=$1 AND trigger_key=$2 AND enabled=TRUE
         AND (last_triggered_at IS NULL OR last_triggered_at<=NOW()-make_interval(secs=>cooldown_seconds))
         AND (claimed_at IS NULL OR claimed_at<=NOW()-INTERVAL '10 minutes')
       ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED
     ), claimed AS (
       UPDATE guild_spell_automations a SET claimed_at=NOW()
       FROM due WHERE a.automation_id=due.automation_id RETURNING a.*
     )
     SELECT c.*,t.title AS embed_title,t.description AS embed_description,t.color AS embed_color,
       t.footer AS embed_footer,t.fields AS embed_fields
     FROM claimed c LEFT JOIN guild_embed_templates t ON t.template_id=c.template_id`,
    [guildId,triggerKey]
  );
  let sent=0,skipped=0;
  for(const rule of claimed.rows){
    try{
      const channel=await client.channels.fetch(rule.channel_id);
      if(!channel?.isTextBased?.() || String(channel.guildId||'')!==String(guildId)) { skipped++;continue; }
      const permissions=typeof channel.permissionsFor==='function'?channel.permissionsFor(client.user):null;
      if(permissions && !permissions.has('SendMessages')) { skipped++;continue; }
      if(rule.template_id && permissions && !permissions.has('EmbedLinks')) { skipped++;continue; }
      const replacements={player:String(context.player||'Maceracı'),boss:String(context.boss||'Boss'),event:String(context.event||'Etkinlik'),spell:String(context.spell||'Büyü')};
      const content=String(rule.message).replace(/\{\{(player|boss|event|spell)\}\}/g,(_match,key)=>replacements[key]).slice(0,1900);
      const embeds=[];
      if(rule.template_id&&rule.embed_title){
        const embed=new EmbedBuilder().setColor(Number(rule.embed_color)||0x9b8cff).setTitle(rule.embed_title).setDescription(rule.embed_description||'');
        if(rule.embed_footer)embed.setFooter({text:rule.embed_footer});
        if(Array.isArray(rule.embed_fields)&&rule.embed_fields.length)embed.addFields(rule.embed_fields.slice(0,5));
        embeds.push(embed);
      }
      await channel.send({content,embeds,allowedMentions:{parse:[]}});
      await db.query('UPDATE guild_spell_automations SET last_triggered_at=NOW(),claimed_at=NULL WHERE automation_id=$1 AND claimed_at IS NOT NULL',[rule.automation_id]);
      sent++;
    }catch(error){
      await db.query('UPDATE guild_spell_automations SET claimed_at=NULL WHERE automation_id=$1',[rule.automation_id]).catch(()=>{});
      skipped++;console.warn('Lonca büyü otomasyonu gönderilemedi:',error?.message||error);
    }
  }
  return {sent,skipped};
}
