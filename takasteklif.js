import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { pool, ensureUser } from './database/db.js';

export default {
 data:new SlashCommandBuilder().setName('takasteklif').setDescription('Bir karakter kopyanı başka kullanıcıya teklif et.')
  .addUserOption(o=>o.setName('kullanici').setDescription('Teklif göndereceğin kullanıcı').setRequired(true))
  .addStringOption(o=>o.setName('karakter').setDescription('Karakterin tam adı').setRequired(true))
  .addIntegerOption(o=>o.setName('miktar').setDescription('Göndermek istediğin kopya sayısı').setMinValue(1).setRequired(true)),
 async execute(interaction){
  if(!interaction.guildId)return interaction.reply({content:'Bu komut yalnızca sunucularda kullanılabilir.',ephemeral:true});
  const target=interaction.options.getUser('kullanici',true);
  const name=interaction.options.getString('karakter',true).trim();
  const amount=interaction.options.getInteger('miktar',true);
  if(target.bot||target.id===interaction.user.id)return interaction.reply({content:'Kendine veya botlara takas teklifi gönderemezsin.',ephemeral:true});
  await ensureUser(interaction.guildId,interaction.user.id);
  await ensureUser(interaction.guildId,target.id);
  const owned=await pool.query('SELECT character_name,rarity,quantity FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND LOWER(character_name)=LOWER($3)',[interaction.guildId,interaction.user.id,name]);
  if(!owned.rowCount)return interaction.reply({content:'Koleksiyonunda **'+name+'** bulunamadı.',ephemeral:true});
  if(amount>=Number(owned.rows[0].quantity))return interaction.reply({content:'Son kopyanı korumak için en fazla **'+(Number(owned.rows[0].quantity)-1)+'** kopya teklif edebilirsin.',ephemeral:true});
  const c=owned.rows[0];
  const encoded=Buffer.from(JSON.stringify({g:interaction.guildId,f:interaction.user.id,t:target.id,n:c.character_name,a:amount})).toString('base64url');
  if(encoded.length>70)return interaction.reply({content:'Bu teklif oluşturulamadı; lütfen daha kısa karakter adı kullan.',ephemeral:true});
  const row=new ActionRowBuilder().addComponents(
   new ButtonBuilder().setCustomId('trade_accept:'+encoded).setLabel('Teklifi kabul et').setStyle(ButtonStyle.Success),
   new ButtonBuilder().setCustomId('trade_decline:'+encoded).setLabel('Reddet').setStyle(ButtonStyle.Danger)
  );
  const embed=new EmbedBuilder().setColor(0x9b8cff).setTitle('🤝 Karakter Takas Teklifi')
   .setDescription('<@'+target.id+'>, **'+interaction.user.username+'** sana **'+amount+'× '+c.character_name+'** teklif ediyor.\n\nKabul edersen bu kopyalar koleksiyonuna aktarılır. Teklif 5 dakika geçerlidir.')
   .setFooter({text:'Yalnızca teklif gönderilen kullanıcı yanıtlayabilir.'}).setTimestamp();
  return interaction.reply({embeds:[embed],components:[row]});
 }
};
