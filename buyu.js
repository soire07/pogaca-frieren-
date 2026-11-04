import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { pool } from './database/db.js';
import { getGuildCustomCommand, runGuildSpellAutomations } from './guild-workshop.js';
const spells = [
  ['Zoltraak', 'Kurgusal saldırı büyüsü — hedefe güçlü bir büyü enerjisi gönderir.'],
  ['Çiçek Bahçesi', 'Etrafı çiçeklerle dolduran huzurlu bir büyü.'],
  ['Temizlik Büyüsü', 'Macera sonrası pelerinindeki tozu temizlemeye yarar.'],
  ['Poğaça Isıtma Büyüsü', 'Poğaçanı tam kararında ısıtır. Frieren bile tarifini sorabilir.'],
  ['Mimic Tespit Büyüsü', 'Sandığın gerçekten güvenli olup olmadığını kontrol etmeye çalışır.']
];
export default {
  data: new SlashCommandBuilder().setName('buyu').setDescription('Rastgele bir büyü keşfet veya loncanın özel büyüsünü kullan.')
    .addStringOption(option=>option.setName('ad').setDescription('Lonca atölyesinde oluşturulan özel komut / büyü adı').setMaxLength(32).setRequired(false)),
  async execute(interaction) {
    const customName=interaction.options.getString('ad');
    if(customName){
      if(!interaction.guildId)return interaction.reply({content:'Özel büyüler yalnızca sunucuda kullanılabilir.',flags:MessageFlags.Ephemeral});
      const custom=await getGuildCustomCommand(pool,interaction.guildId,customName);
      if(!custom)return interaction.reply({content:'Bu özel komut veya büyü bulunamadı. Adını ve sunucunu kontrol et.',flags:MessageFlags.Ephemeral});
      if(custom.kind==='command'){
        return interaction.reply({content:custom.response_text,allowedMentions:{parse:[]}});
      }
      const elementNames={fire:'Ateş',ice:'Buz',wind:'Rüzgâr',light:'Işık',shadow:'Gölge'};
      const embed=new EmbedBuilder().setColor(0x9b8cff).setTitle('🔮 '+custom.trigger_name.replace(/[_-]/g,' ')).setDescription(custom.response_text)
        .addFields(
          {name:'Element',value:elementNames[custom.element]||custom.element,inline:true},
          {name:'Mana maliyeti',value:String(custom.mana_cost),inline:true},
          {name:'Büyü gücü',value:String(custom.power),inline:true}
        ).setFooter({text:'Lonca Büyü Atölyesi'});
      await interaction.reply({embeds:[embed]});
      await runGuildSpellAutomations(pool,interaction.client,interaction.guildId,'custom_spell',{spell:custom.trigger_name,player:interaction.user.username})
        .catch(error=>console.warn('Özel büyü otomasyonu çalıştırılamadı:',error?.message||error));
      return;
    }
    const [name, description] = spells[Math.floor(Math.random() * spells.length)];
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x9b8cff).setTitle(`🔮 ${name}`).setDescription(description)] });
  }
};
