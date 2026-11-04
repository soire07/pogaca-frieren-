import {MessageFlags,SlashCommandBuilder} from 'discord.js';
import {pool} from './database/db.js';
import {FARM_SEEDS,getFarmPlot,plantSeed,harvestFarm} from './farming.js';
const reply=(i,content)=>i.reply({content,flags:MessageFlags.Ephemeral});
export default {
 data:new SlashCommandBuilder().setName('bahce').setDescription('Zafer değil, sabırla büyüyen Gezgin Bahçeni yönet.')
 .addSubcommand(s=>s.setName('durum').setDescription('Bahçendeki ekini ve hasat zamanını gör.'))
 .addSubcommand(s=>s.setName('tohum-ek').setDescription('Bahçene yeni tohum ek.').addStringOption(o=>o.setName('tohum').setDescription('Tohum türü').setRequired(true).addChoices(...FARM_SEEDS.map(x=>({name:x.seedName+' · '+x.cost+' altın',value:x.key})))))
 .addSubcommand(s=>s.setName('hasat').setDescription('Olgunlaşan ürünü topla.')),
 async execute(i){
  if(!i.guildId)return reply(i,'Bahçe yalnızca sunucularda kullanılabilir.');
  const p={guildId:i.guildId,userId:i.user.id};
  const room=await pool.query("SELECT 1 FROM player_home_rooms WHERE guild_id=$1 AND user_id=$2 AND room_key='garden'",[p.guildId,p.userId]);
  if(!room.rowCount)return reply(i,'Önce /yasam oda-ac ile Gezgin Bahçesini açmalısın.');
  const action=i.options.getSubcommand();
  if(action==='durum'){
   const plot=await getFarmPlot(pool,p.guildId,p.userId);
   if(!plot)return reply(i,'Bahçen boş. /bahce tohum-ek ile ekime başlayabilirsin.');
   return reply(i,'**Gezgin Bahçesi**\nEkin: '+(plot.seed?.name||plot.seed_key)+'\nDurum: '+(plot.ready?'Hasada hazır.':'Büyüyor; hasat zamanı '+new Date(plot.harvest_at).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})));
  }
  if(action==='tohum-ek'){
   const result=await plantSeed(pool,{...p,seedKey:i.options.getString('tohum')});
   const messages={planted:'Tohum ekildi: '+result.seed.name+'. Hasat zamanı '+new Date(Date.now()+result.seed.growMinutes*60000).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'}),plot_occupied:'Bahçende zaten büyüyen bir ekin var.',locked_seed:'Bu tohum için gereken seviye: '+result.seed.minLevel,insufficient_funds:'Tohum için yeterli altının yok. Gerekli: '+result.cost};
   return reply(i,messages[result.status]||'Tohum ekilemedi.');
  }
  const result=await harvestFarm(pool,p);
  const messages={harvested:'Hasat tamamlandı: '+result.quantity+' × '+result.seed.name+'. Ürün envanterine eklendi.',no_plot:'Hasat edilecek ekin yok.',growing:'Ekin henüz olgunlaşmadı. Hasat zamanı '+new Date(result.harvestAt).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})};
  return reply(i,messages[result.status]||'Hasat yapılamadı.');
 }
};
