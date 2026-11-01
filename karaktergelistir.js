import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { characters } from './character-data.js';

const costFor = level => 250 * (level + 1);
export default {
  internalOnly: true,
 data:new SlashCommandBuilder().setName('karaktergelistir').setDescription('Koleksiyonundaki karakterin seviyesini yükselt.')
  .addStringOption(o=>o.setName('karakter').setDescription('Geliştirmek istediğin karakterin adı').setRequired(true).setAutocomplete(true))
  .addBooleanOption(o=>o.setName('yukselt').setDescription('Evet seçersen yükseltme işlemini yapar; hayır seçersen bilgiyi gösterir.').setRequired(false)),
 async autocomplete(interaction){
  const focused=interaction.options.getFocused().toLocaleLowerCase('tr-TR');
  const {rows}=await pool.query('SELECT character_name FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND LOWER(character_name) LIKE LOWER($3) ORDER BY character_name LIMIT 25',[interaction.guildId,interaction.user.id,`%${focused}%`]);
  await interaction.respond(rows.map(r=>({name:r.character_name,value:r.character_name})));
 },
 async execute(interaction){
  if(!interaction.guildId)return interaction.reply({content:'Bu komut yalnızca sunucularda kullanılabilir.',flags: MessageFlags.Ephemeral});
  await interaction.deferReply({flags: MessageFlags.Ephemeral});
  const name=interaction.options.getString('karakter');
  const doUpgrade=interaction.options.getBoolean('yukselt')===true;
  await ensureUser(interaction.guildId,interaction.user.id);
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   const {rows:[user]}=await db.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',[interaction.guildId,interaction.user.id]);
   const {rows:[character]}=await db.query('SELECT character_name,rarity,quantity FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND LOWER(character_name)=LOWER($3) FOR UPDATE',[interaction.guildId,interaction.user.id,name]);
   if(!character){await db.query('ROLLBACK');return interaction.editReply('Bu karakter koleksiyonunda bulunamadı.');}
   const {rows:[up]}=await db.query('SELECT upgrade_level FROM character_upgrades WHERE guild_id=$1 AND user_id=$2 AND character_name=$3',[interaction.guildId,interaction.user.id,character.character_name]);
   const level=Number(up?.upgrade_level||0);
   if(!doUpgrade){
    await db.query('ROLLBACK');
    const embed=new EmbedBuilder().setColor(0x9b8cff).setTitle('✨ '+character.character_name+' • Geliştirme')
     .setDescription(`Mevcut geliştirme: **+${level}**\nSonraki seviye maliyeti: **${costFor(level)} altın**\nKarakter kopyası: ×${character.quantity}\n\nYükseltmek için aynı komutta yukselt seçeneğini Evet yap.`);
    return interaction.editReply({embeds:[embed]});
   }
   if(level>=10){await db.query('ROLLBACK');return interaction.editReply('Bu karakter en yüksek +10 seviyesine ulaştı.');}
   const cost=costFor(level);
   if(Number(user.coins)<cost){await db.query('ROLLBACK');return interaction.editReply(`Yetersiz altın. Gereken: ${cost}; bakiyen: ${user.coins}.`);}
   await db.query('UPDATE users SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2',[interaction.guildId,interaction.user.id,cost]);
   await db.query(`INSERT INTO character_upgrades(guild_id,user_id,character_name,upgrade_level) VALUES($1,$2,$3,1)
    ON CONFLICT(guild_id,user_id,character_name) DO UPDATE SET upgrade_level=character_upgrades.upgrade_level+1`,[interaction.guildId,interaction.user.id,character.character_name]);
   const newLevel=level+1;
   await db.query('COMMIT');
   return interaction.editReply(`✨ **${character.character_name}** artık **+${newLevel}**! ${cost} altın harcandı.`);
  }catch(error){await db.query('ROLLBACK').catch(()=>{});console.error('/karaktergelistir hatası:',error);return interaction.editReply('Karakter geliştirilemedi. Daha sonra tekrar dene.');}
  finally{db.release();}
 }
};
