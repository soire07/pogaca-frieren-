import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { pool } from './database/db.js';
import {
  FISHING_ZONES,FISHING_BAITS,FISHING_RODS,fishAtZone,getFishCollection,getFishingGear,
  upgradeFishingRod,purchaseFishingBait,initFishingSchema
} from './fishing.js';
let schemaReady;
async function ensureSchema() {
  if (!schemaReady) schemaReady = initFishingSchema(pool).catch(error => { schemaReady = null; throw error; });
  await schemaReady;
}
export default {
  data: new SlashCommandBuilder().setName('balik').setDescription('Kuzey Kıtası’nda balık tut, oltanı geliştir ve balık defterini tamamla.')
    .addSubcommand(sub => sub.setName('avlan').setDescription('Seçtiğin bölgede balık tut.')
      .addStringOption(option => option.setName('bolge').setDescription('Balık tutacağın bölge.').setRequired(true)
        .addChoices(...FISHING_ZONES.map(zone => ({ name: zone.name, value: zone.key })))))
    .addSubcommand(sub => sub.setName('defter').setDescription('Yakaladığın balıkları ve koleksiyon ilerlemeni gör.'))
    .addSubcommand(sub => sub.setName('ekipman').setDescription('Oltanı, aktif yemini ve altın bakiyeni görüntüle.'))
    .addSubcommand(sub => sub.setName('olta').setDescription('Bir sonraki olta seviyesini altınla geliştir.'))
    .addSubcommand(sub => sub.setName('yem').setDescription('Seçtiğin yemden 5 adet satın al.')
      .addStringOption(option => option.setName('tur').setDescription('Satın alınacak yem türü.').setRequired(true)
        .addChoices(...FISHING_BAITS.map(bait=>({name:bait.name+' · '+bait.price+' altın',value:bait.key}))))),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Balıkçılık yalnızca sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await ensureSchema();
      const action=interaction.options.getSubcommand();
      if(action==='defter'){
        const book=await getFishCollection(pool,interaction.guildId,interaction.user.id);
        const lines=book.entries.map(item=>(item.fish?.emoji||'🐟')+' **'+(item.fish?.name||item.fish_key)+'** × '+item.quantity+' · '+(item.fish?.rarity||'Bilinmiyor'));
        const embed=new EmbedBuilder().setColor(0x78c8df).setTitle('📖 Kuzey Balık Defteri')
          .setDescription(lines.join('\\n')||'Henüz balık yakalamadın. İlk avın için /balik avlan kullan.')
          .setFooter({text:book.unique+'/'+book.totalSpecies+' tür · toplam '+book.caught+' yakalama'});
        return interaction.editReply({embeds:[embed]});
      }
      if(action==='ekipman'){
        const gear=await getFishingGear(pool,interaction.guildId,interaction.user.id);
        const embed=new EmbedBuilder().setColor(0x78c8df).setTitle('🎣 Balıkçılık Ekipmanların')
          .addFields(
            {name:'Olta',value:gear.rod.name+' · Seviye '+gear.rodLevel,inline:true},
            {name:'Aktif yem',value:gear.activeBait+' × '+gear.baitCount,inline:true},
            {name:'Altın',value:gear.coins.toLocaleString('tr-TR'),inline:true},
            {name:'Sonraki geliştirme',value:gear.nextRod?gear.nextRod.name+' · '+gear.nextRod.upgradeCost.toLocaleString('tr-TR')+' altın':'En yüksek olta seviyesi',inline:false}
          );
        return interaction.editReply({embeds:[embed]});
      }
      if(action==='olta'){
        const result=await upgradeFishingRod(pool,{guildId:interaction.guildId,userId:interaction.user.id});
        const messages={
          upgraded:'Oltan **'+result.rod.name+'** seviyesine yükseltildi. **'+result.cost+' altın** harcandı.',
          max_level:'Zaten en yüksek olta seviyesindesin.',
          insufficient_funds:'Geliştirme için **'+result.cost+' altın** gerekiyor. Bakiyen: **'+result.balance+'**.'
        };
        return interaction.editReply({content:messages[result.status]||'Olta geliştirilemedi.'});
      }
      if(action==='yem'){
        const result=await purchaseFishingBait(pool,{guildId:interaction.guildId,userId:interaction.user.id,baitKey:interaction.options.getString('tur',true)});
        const messages={
          purchased:'**'+result.bait.name+' × '+result.bait.packSize+'** satın alındı. Aktif yem stoğun: **'+result.baitCount+'**.',
          insufficient_funds:'Bu yem paketi için **'+result.cost+' altın** gerekiyor. Bakiyen: **'+result.balance+'**.',
          bait_stack_active:'Önce mevcut **'+result.baitCount+'** adet yem stoğunu tüketmelisin; farklı yem türünü aynı anda depolayamazsın.',
          invalid_bait:'Yem türü geçersiz.'
        };
        return interaction.editReply({content:messages[result.status]||'Yem satın alınamadı.'});
      }
      const result=await fishAtZone(pool,{guildId:interaction.guildId,userId:interaction.user.id,zoneKey:interaction.options.getString('bolge',true)});
      let embed;
      if(result.status==='caught'){
        const baitText=result.baitUsed?'\\nYem: **'+(FISHING_BAITS.find(item=>item.key===result.baitUsed)?.name||result.baitUsed)+'**':'';
        embed=new EmbedBuilder().setColor(0x78c8df).setTitle('🎣 Kuzey Kıtası’nda av')
          .setDescription(result.fish.emoji+' **'+result.fish.name+'** yakaladın!\\nNadirlik: **'+result.fish.rarity+'**\\nBölge: **'+result.zone.name+'**\\nOlta: **'+FISHING_RODS[result.rodLevel-1].name+'**'+baitText);
      } else if(result.status==='cooldown') embed=new EmbedBuilder().setColor(0xe0b45c).setTitle('⏳ Oltanı dinlendir').setDescription('Bir sonraki av için 30 dakika beklemelisin.');
      else if(result.status==='locked_zone') embed=new EmbedBuilder().setColor(0xe0b45c).setTitle('🔒 Bölge henüz keşfedilmedi').setDescription('**'+result.zone.name+'** için en az **'+result.requiredLevel+'. seviye** gerekiyor. Mevcut seviyen: '+result.level+'.');
      else embed=new EmbedBuilder().setColor(0xe07b72).setDescription('Bu balıkçılık işlemi gerçekleştirilemedi.');
      return interaction.editReply({embeds:[embed]});
    } catch(error) {
      console.error('Balıkçılık komutu başarısız:',error?.message||error);
      return interaction.editReply({content:'Balıkçılık şu anda kullanılamıyor. Biraz sonra tekrar dene.'});
    }
  }
};
