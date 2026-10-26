import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';

const items = {
  lucky_charm: { name:'🍀 Şans Tılsımı', price:250, description:'Koleksiyonunda saklayabileceğin nadir bir tılsım.' },
  frieren_tea: { name:'🍵 Frieren Çayı', price:120, description:'Fırının özel temalı hatıra eşyası.' },
  mana_crystal: { name:'💎 Mana Kristali', price:500, description:'Büyülü koleksiyon için değerli bir kristal.' }
};

export default {
 data:new SlashCommandBuilder().setName('market').setDescription('Poğaça altınıyla özel eşyalar satın al.')
  .addStringOption(o=>o.setName('esya').setDescription('Satın almak istediğin eşya').setRequired(true)
   .addChoices(
    {name:'Şans Tılsımı — 250 altın',value:'lucky_charm'},
    {name:'Frieren Çayı — 120 altın',value:'frieren_tea'},
    {name:'Mana Kristali — 500 altın',value:'mana_crystal'}
   ))
  .addIntegerOption(o=>o.setName('miktar').setDescription('Kaç tane alacaksın?').setMinValue(1).setMaxValue(20).setRequired(true)),
 async execute(interaction){
  if(!interaction.guildId)return interaction.reply({content:'Bu komut yalnızca sunucularda kullanılabilir.',ephemeral:true});
  const key=interaction.options.getString('esya',true);
  const amount=interaction.options.getInteger('miktar',true);
  const item=items[key];
  await ensureUser(interaction.guildId,interaction.user.id);
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const cost=item.price*amount;
   const charged=await client.query('UPDATE users SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2 AND coins >= $3 RETURNING coins',[interaction.guildId,interaction.user.id,cost]);
   if(!charged.rowCount){
    await client.query('ROLLBACK');
    return interaction.reply({content:'Yeterli altının yok. Bu alışveriş için **'+cost+'** altın gerekiyor.',ephemeral:true});
   }
   await client.query(`INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,$4)
    ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity`,
    [interaction.guildId,interaction.user.id,item.name,amount]);
   await client.query('COMMIT');
   const embed=new EmbedBuilder().setColor(0x9b8cff).setTitle('🛍️ Poğaça Marketi')
    .setDescription(item.name+' eşyasından **'+amount+'** adet satın aldın!\n\n'+item.description)
    .addFields({name:'Ödenen',value:'🪙 '+cost+' altın',inline:true},{name:'Kalan bakiye',value:'🪙 '+Number(charged.rows[0].coins).toLocaleString('tr-TR')+' altın',inline:true})
    .setFooter({text:'Eşyalarını /envanter komutuyla görebilirsin.'}).setTimestamp();
   return interaction.reply({embeds:[embed]});
  }catch(error){
   await client.query('ROLLBACK').catch(()=>{});
   console.error('Market hatası:',error);
   return interaction.reply({content:'Alışveriş tamamlanamadı. Daha sonra tekrar dene.',ephemeral:true}).catch(()=>{});
  }finally{client.release();}
 }
};
