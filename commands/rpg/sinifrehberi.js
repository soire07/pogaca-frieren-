import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { characterClassGuide } from '../../rpg-mechanics.js';

const classAdvice = {
  buyucu: { icon: '🔮', role: 'Büyü ve mana verimliliği', advice: 'Büyü kullanmayı ve mana harcamasını planlamayı seviyorsan seç.' },
  muhafiz: { icon: '🛡️', role: 'Dayanıklılık', advice: 'Güvenli ve savunma odaklı savaş tarzı istiyorsan seç.' },
  sifaci: { icon: '💚', role: 'İyileştirme', advice: 'Takım savaşlarında destek rolünü seviyorsan seç.' },
  gezgin: { icon: '🧭', role: 'Dengeli başlangıç', advice: 'Özel bir yöne bağlanmadan sistemleri öğrenmek istiyorsan seç.' }
};

export default {
  data: new SlashCommandBuilder()
    .setName('sinifrehberi')
    .setDescription('Karakter sınıflarını, pasif bonuslarını ve oyun tarzlarını karşılaştır.'),

  async execute(interaction) {
    const classes = characterClassGuide();
    const embed = new EmbedBuilder()
      .setColor(0x9b8cff)
      .setAuthor({ name: 'POĞAÇA FRIEREN • BÜYÜCÜLÜK AKADEMİSİ' })
      .setTitle('🧭 Maceracı Sınıfları')
      .setDescription('Her yolcunun savaşta farklı bir rolü vardır. Sınıfını oyun tarzına göre seç; kararını daha sonra **/sinifsec** ile değiştirebilirsin.')
      .addFields(classes.map(item => {
        const advice = classAdvice[item.key] || classAdvice.gezgin;
        const bonuses = item.bonuses.length ? item.bonuses.map(value => '✦ ' + value).join('\n') : '✦ Özel çarpan yok; dengeli başlangıç';
        return {
          name: advice.icon + ' ' + item.label + ' — ' + advice.role,
          value: item.description + '\n' + bonuses + '\n*' + advice.advice + '*',
          inline: false
        };
      }))
      .addFields(
        { name: '📜 Sınıf mı, takım rolü mü?', value: 'Karakter sınıfın kalıcı savaş pasifini belirler. **Tank / şifacı / hasar** ise özellikle ortak boss ve zindanlarda takımın o karşılaşmadaki görevini anlatır; aynı kavram değiller.', inline: false },
        { name: '✨ Sonraki adım', value: '**/sinifsec** ile sınıfını seç; ardından **/profil** ile karakterini kontrol et ve **/rehber** üzerinden macera rotanı takip et.', inline: false }
      )
      .setFooter({ text: 'Frieren’in yolculuğu • En güçlü sınıf, oyun tarzına en çok uyan sınıftır.' });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
