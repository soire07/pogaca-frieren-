import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
const shardValue={Yaygın:5,Nadir:12,Destansı:30,Efsanevi:75,Gizemli:2000};
export default {
 data:new SlashCommandBuilder()
  .setName('parcala')
  .setDescription('Fazladan karakter kopyalarını altına dönüştür.')
  .addStringOption(o=>o.setName('karakter').setDescription('Dönüştürülecek karakterin tam adı').setRequired(true))
  .addIntegerOption(o=>o.setName('miktar').setDescription('Kaç kopya parçalamak istiyorsun?').setMinValue(1).setRequired(true)),
 async execute(interaction){
  if(!interaction.guildId)return interaction.reply({content:'Bu komut yalnızca sunucularda kullanılabilir.',ephemeral:true});
  const name=interaction.options.getString('karakter',true).trim();
  const amount=interaction.options.getInteger('miktar',true);
  await ensureUser(interaction.guildId,interaction.user.id);
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const found=await client.query(`
    SELECT character_name,rarity,quantity FROM anime_character_collection
    WHERE guild_id=$1 AND user_id=$2 AND LOWER(character_name)=LOWER($3) FOR UPDATE
   `,[interaction.guildId,interaction.user.id,name]);
   if(!found.rowCount){
    await client.query('ROLLBACK');
    return interaction.reply({content:'Koleksiyonunda **'+name+'** bulunamadı. Karakter adını tam yaz.',ephemeral:true});
   }
   const c=found.rows[0];
   const owned=Number(c.quantity);
   if(amount>=owned){
    await client.query('ROLLBACK');
    return interaction.reply({content:'**'+c.character_name+'** karakterinden **'+owned+'** kopyan var. Koleksiyonundaki son kopyayı korumak için en fazla **'+(owned-1)+'** kopya parçalayabilirsin.',ephemeral:true});
   }
   const rewardPerCopy=shardValue[c.rarity]??5;
   const reward=rewardPerCopy*amount;
   await client.query('UPDATE anime_character_collection SET quantity=quantity-$4 WHERE guild_id=$1 AND user_id=$2 AND character_name=$3',[interaction.guildId,interaction.user.id,c.character_name,amount]);
   const balance=await client.query('UPDATE users SET coins=coins+$3 WHERE guild_id=$1 AND user_id=$2 RETURNING coins',[interaction.guildId,interaction.user.id,reward]);
   await client.query('COMMIT');
   const embed=new EmbedBuilder().setColor(0x9b8cff).setTitle('♻️ Karakter kopyaları dönüştürüldü')
    .setDescription('**'+c.character_name+'** karakterinden **'+amount+'** kopya parçaladın.\n\n🪙 Kopya başına: **'+rewardPerCopy+'** altın\n💰 Kazandığın toplam: **'+reward+'** altın\n🧺 Kalan kopya: **'+(owned-amount)+'**\n💳 Yeni bakiye: **'+Number(balance.rows[0].coins).toLocaleString('tr-TR')+'**')
    .setFooter({text:'Koleksiyonundaki son kopya her zaman korunur.'}).setTimestamp();
   return interaction.reply({embeds:[embed]});
  }catch(error){
   await client.query('ROLLBACK').catch(()=>{});
   console.error('Parçala komutu hatası:',error);
   return interaction.reply({content:'Karakter kopyaları dönüştürülemedi. Daha sonra tekrar dene.',ephemeral:true}).catch(()=>{});
  }finally{client.release();}
 }
};
