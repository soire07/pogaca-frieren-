import { randomUUID } from 'node:crypto';
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { pool, ensureUser } from './database/db.js';

export default {
 data:new SlashCommandBuilder().setName('takasteklif').setDescription('Bir karakter kopyanı başka kullanıcıya teklif et.')
  .addUserOption(o=>o.setName('kullanici').setDescription('Teklif göndereceğin kullanıcı').setRequired(true))
  .addStringOption(o=>o.setName('karakter').setDescription('Karakterin tam adı').setRequired(true).setAutocomplete(true))
  .addIntegerOption(o=>o.setName('miktar').setDescription('Göndermek istediğin kopya sayısı').setMinValue(1).setRequired(true)),
 async autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLocaleLowerCase('tr-TR');
  const { rows } = await pool.query(
   'SELECT character_name FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND LOWER(character_name) LIKE LOWER($3) ORDER BY character_name LIMIT 25',
   [interaction.guildId, interaction.user.id, `%${focused}%`]
  );
  await interaction.respond(rows.map(row => ({ name: row.character_name, value: row.character_name })));
 },
 async execute(interaction){
  if(!interaction.guildId)return interaction.reply({content:'Bu komut yalnızca sunucularda kullanılabilir.',ephemeral:true});
  const target=interaction.options.getUser('kullanici',true);
  const name=interaction.options.getString('karakter',true).trim();
  const amount=interaction.options.getInteger('miktar',true);
  if(target.bot||target.id===interaction.user.id)return interaction.reply({content:'Kendine veya botlara takas teklifi gönderemezsin.',ephemeral:true});
  await ensureUser(interaction.guildId,interaction.user.id);
  await ensureUser(interaction.guildId,target.id);
  const owned=await pool.query(
   'SELECT character_name,quantity FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND LOWER(character_name)=LOWER($3)',
   [interaction.guildId,interaction.user.id,name]
  );
  if(!owned.rowCount)return interaction.reply({content:'Koleksiyonunda **'+name+'** bulunamadı.',ephemeral:true});
  if(amount>=Number(owned.rows[0].quantity))return interaction.reply({content:'Son kopyanı korumak için en fazla **'+(Number(owned.rows[0].quantity)-1)+'** kopya teklif edebilirsin.',ephemeral:true});

  const offerId=randomUUID();
  const expiresAt=new Date(Date.now()+5*60*1000);
  await pool.query(
   `INSERT INTO trade_offers(offer_id,guild_id,from_user_id,to_user_id,character_name,amount,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,
   [offerId,interaction.guildId,interaction.user.id,target.id,owned.rows[0].character_name,amount,expiresAt]
  );
  const row=new ActionRowBuilder().addComponents(
   new ButtonBuilder().setCustomId('trade_accept:'+offerId).setLabel('Teklifi kabul et').setStyle(ButtonStyle.Success),
   new ButtonBuilder().setCustomId('trade_decline:'+offerId).setLabel('Reddet').setStyle(ButtonStyle.Danger)
  );
  const embed=new EmbedBuilder().setColor(0x9b8cff).setTitle('🤝 Karakter Takas Teklifi')
   .setDescription('<@'+target.id+'>, **'+interaction.user.username+'** sana **'+amount+'× '+owned.rows[0].character_name+'** teklif ediyor.\n\nKabul edersen bu kopyalar koleksiyonuna aktarılır. Teklif 5 dakika geçerlidir.')
   .setFooter({text:'Teklif yalnızca bir kez sonuçlandırılabilir; sadece alıcı yanıt verebilir.'}).setTimestamp();
  return interaction.reply({embeds:[embed],components:[row]});
 }
};
