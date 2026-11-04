import { SlashCommandBuilder,EmbedBuilder,MessageFlags } from 'discord.js';
import { pool } from './database/db.js';
import { FARM_SEEDS,harvestFarm,getFarmPlot,initFarmSchema,plantSeed,seasonForDate } from './farming.js';
let schemaReady;
async function ensureSchema(){if(!schemaReady)schemaReady=initFarmSchema(pool).catch(error=>{schemaReady=null;throw error;});await schemaReady;}
export default{
 data:new SlashCommandBuilder().setName('sera').setDescription('Büyülü Sera’da tohum ek, yetiştir ve hasat et.')
 .addSubcommand(s=>s.setName('ekim').setDescription('Bir tohum ekerek yetiştirmeye başla.').addStringOption(o=>o.setName('tohum').setDescription('Ekeceğin tohum.').setRequired(true).addChoices(...FARM_SEEDS.map(seed=>({name:seed.seedName+' · '+seed.cost+' altın',value:seed.key}))))
 ).addSubcommand(s=>s.setName('hasat').setDescription('Olgunlaşan ürünü topla.'))
 .addSubcommand(s=>s.setName('durum').setDescription('Serandaki bitkinin gelişimini gör.')),
 async execute(interaction){
  if(!interaction.guildId)return interaction.reply({content:'Sera yalnızca sunucularda kullanılabilir.',flags:MessageFlags.Ephemeral});
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  try{
   await ensureSchema();const input={guildId:interaction.guildId,userId:interaction.user.id};let result;
   const action=interaction.options.getSubcommand();
   if(action==='ekim')result=await plantSeed(pool,{...input,seedKey:interaction.options.getString('tohum',true)});
   else if(action==='hasat')result=await harvestFarm(pool,input);
   else{
    const plot=await getFarmPlot(pool,input.guildId,input.userId);
    if(!plot)return interaction.editReply({embeds:[new EmbedBuilder().setColor(0x8bbf91).setTitle('🌱 Büyülü Sera').setDescription('Şu anda ekili bir tohumun yok. /sera ekim ile başlayabilirsin.') ]});
    const ready=plot.ready===true;
    return interaction.editReply({embeds:[new EmbedBuilder().setColor(0x8bbf91).setTitle('🌱 '+(plot.seed?.name||'Bilinmeyen bitki')).setDescription(ready?'Hasat zamanı geldi. /sera hasat kullan.':'Bitkin büyümeye devam ediyor. Hasat zamanı: '+new Date(plot.harvest_at).toLocaleString('tr-TR',{timeZone:'UTC'})+' UTC') ]});
   }
   let embed;
   if(result.status==='planted')embed=new EmbedBuilder().setColor(0x8bbf91).setTitle('🌱 Tohum ekildi').setDescription('**'+result.seed.name+'** ekildi. Yetişme süresi: **'+result.seed.growMinutes+' dakika**. Kalan altın: **'+result.balance+'**.');
   else if(result.status==='harvested')embed=new EmbedBuilder().setColor(0x8bbf91).setTitle('🌾 Hasat tamamlandı').setDescription('**'+result.seed.name+'** × **'+result.quantity+'** envanterine eklendi. Mevsim: **'+seasonForDate()+'**.');
   else if(result.status==='growing')embed=new EmbedBuilder().setColor(0xe0b45c).setTitle('⏳ Henüz olgunlaşmadı').setDescription('Bitkinin yetişmesi için biraz daha zaman gerekiyor.');
   else if(result.status==='plot_occupied')embed=new EmbedBuilder().setColor(0xe0b45c).setDescription('Önce mevcut ekimini hasat etmelisin.');
   else if(result.status==='locked_seed')embed=new EmbedBuilder().setColor(0xe0b45c).setDescription('Bu tohum için en az '+result.seed.minLevel+'. seviye gerekiyor. Mevcut seviyen: '+result.level+'.');
   else if(result.status==='insufficient_funds')embed=new EmbedBuilder().setColor(0xe0b45c).setDescription('Bu tohum için '+result.cost+' altın gerekiyor.');
   else embed=new EmbedBuilder().setColor(0xe07b72).setDescription('Sera işlemi gerçekleştirilemedi.');
   return interaction.editReply({embeds:[embed]});
  }catch(error){console.error('Sera komutu başarısız:',error?.message||error);return interaction.editReply({content:'Sera şu anda kullanılamıyor. Biraz sonra tekrar dene.'});}
 }
};
