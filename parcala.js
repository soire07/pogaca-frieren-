import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
const shardValue={Yaygın:5,Nadir:12,Destansı:30,Efsanevi:75};
export default {
 data:new SlashCommandBuilder().setName('parcala').setDescription('Fazladan sahip olduğun karakter kopyasını altına dönüştür.')
  .addStringOption(o=>o.setName('karakter').setDescription('Dönüştürülecek karakterin tam adı').setRequired(true)),
 async execute(interaction){
  if(!interaction.guildId)return interaction.reply({content:'Bu komut yalnızca sunucularda kullanılabilir.',ephemeral:true});
  const name=interaction.options.getString('karakter',true).trim();
  await ensureUser(interaction.guildId,interaction.user.id);
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const found=await client.query(`
    SELECT character_name,rarity,quantity FROM anime_character_collection
    WHERE guild_id=$1 AND user_id=$2 AND LOWER(character_name)=LOWER($3) FOR UPDATE
   `,[interaction.guildId,interaction.user.id,name]);
   if(!found.rowCount){await client.query('ROLLBACK');return interaction.reply({content:'Koleksiyonunda **'+name+'** bulunamadı. Karakter adını tam yaz.',ephemeral:true});}
   const c=found.rows[0];
   if(Number(c.quantity)<=1){await client.query('ROLLBACK');return interaction.reply({content:'**'+c.character_name+'** karakterinin yalnızca bir kopyası var. Son kopyanı parçalayamazsın.',ephemeral:true});}
   const reward=shardValue[c.rarity]??5;
   await client.query('UPDATE anime_character_collection SET quantity=quantity-1 WHERE guild_id=$1 AND user_id=$2 AND character_name=$3',[interaction.guildId,interaction.user.id,c.character_name]);
   const balance=await client.query('UPDATE users SET coins=coins+$3 WHERE guild_id=$1 AND user_id=$2 RETURNING coins',[interaction.guildId,interaction.user.id,reward]);
   await client.query('COMMIT');
   const embed=new EmbedBuilder().setColor(0x9b8cff).setTitle('♻️ Kopya dönüştürüldü')
    .setDescription('**'+c.character_name+'** karakterinin fazla bir kopyasını dönüştürdün.\n\n🪙 Kazandığın: **'+reward+'** altın\n💰 Yeni bakiyen: **'+Number(balance.rows[0].coins)+'**')
    .setFooter({text:'Karakter koleksiyonundaki son kopya korunur.'}).setTimestamp();
   return interaction.reply({embeds:[embed]});
  }catch(error){
   await client.query('ROLLBACK').catch(()=>{});
   console.error('Parçala komutu hatası:',error);
   return interaction.reply({content:'Karakter kopyası dönüştürülemedi. Daha sonra tekrar dene.',ephemeral:true}).catch(()=>{});
  }finally{client.release();}
 }
};
