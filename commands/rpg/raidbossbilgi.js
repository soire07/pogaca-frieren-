import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { RAID_BOSSES } from '../../rpg-mechanics.js';
import { pool } from '../../database/db.js';
import { getGuildRpgContent } from '../../owner-rpg-content.js';

const bossChoices = RAID_BOSSES.map(boss => ({
  name: boss.name.replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 100),
  value: boss.id
}));

function formatBoss(boss, detail) {
  const isZeldeila = boss.id === 'zeldeila';
  const isDomaltazor = boss.id === 'domaltazor';
  const isTheFool = boss.id === 'the-fool';
  const lootChance = Number.isFinite(Number(boss.lootChance)) ? Number(boss.lootChance) * 100 : null;
  const titleChance = Number.isFinite(Number(boss.titleDropChance)) ? Number(boss.titleDropChance) * 100 : null;
  const bossClass = boss.class || 'Standart';
  const special = boss.id === 'fallen-mage'
    ? 'Üç form: Düşmüş Büyücü (Mana Laneti), Düşmüş Melek (Kara Kanat Fırtınası), Melek (İlahi Hüküm). Mühürler, kanat kırılması, büyü bariyeri ve düşük ihtimalli gizli Alacakaranlık formu bulunur.'
    : ({
    'eternal-regeneration': 'Sonsuz Yenilenme: aldığı hasarı saniyede geri kazanır; 1 HP altına düşmez. Mutlak Alan: yaşayan tüm oyunculara saniyede alan hasarı verir.',
    'katun-judgment': 'Katun Hükmü: her 3 turda hedefe güçlendirilmiş saldırı yapar.',
    'fools-gamble': 'Kader Oyunu: her 3 turda bir üç sonuçtan biri belirir. Talih tüm takımı iyileştirir, Talihsizlik tüm takıma hasar verir, Joker ise mana tüketip ek hasar uygular. Sonuçlar eşit olasılıklıdır.',
    'mana-star': 'Mana Yıldız Patlaması: her 3 turda tüm yaşayan oyunculara alan hasarı verir.',
    'shard-rain': 'Kristal Yağmuru: her 2 turda tüm yaşayan oyunculara alan hasarı verir.',
    'mana-curse': 'Mana Laneti: her 3 turda hedefin manasını tüketir.'
  }[boss.special] || 'Özel hareket bilgisi tanımlanmamış.');
  const embed = new EmbedBuilder()
    .setColor(isZeldeila ? 0x8b78db : isDomaltazor ? 0x9a7654 : isTheFool ? 0xd6ad45 : 0x6e5ab8)
    .setTitle(boss.name)
    .setDescription(isZeldeila
      ? 'Bu karşılaşma kasıtlı olarak yenilmez tasarlanmıştır. Amaç hayatta kalma mücadelesidir.'
      : isDomaltazor
        ? 'Kadim Cellat. Çok düşük ihtimalli efsanevi Katun Yüzüğü ganimetine sahiptir.'
        : isTheFool
          ? 'Tarot’un Deli kartından doğan gezgin. Kaderi üç farklı biçimde büker; her üç turda bir takımın talihini sınar.'
        : 'Ortak baskın kataloğundaki raid boss.')
    .addFields(
      { name: '♾️ Boss sınıfı', value: `**${bossClass}**`, inline: true },
      { name: '❤️ Boss HP', value: Number(boss.hp).toLocaleString('tr-TR'), inline: true },
      { name: '⚔️ Temel saldırı', value: String(boss.damage), inline: true },
      { name: '✨ Zafer ödülü', value: `${Number(boss.xp || 0).toLocaleString('tr-TR')} XP · ${Number(boss.coins || 0).toLocaleString('tr-TR')} altın`, inline: true },
      { name: '🎯 Zayıflık', value: boss.weaknessLabel || 'Belirtilmemiş', inline: true },
      { name: '💥 Özel yetenek', value: special, inline: false },
      { name: '💎 Eşya ganimeti', value: boss.loot ? `${boss.loot}${lootChance === null ? '' : ` · %${lootChance.toLocaleString('tr-TR')}`}` : 'Eşya düşürmez.', inline: true },
      ...(boss.titleDrop ? [{ name: '🏅 Unvan ganimeti', value: `${boss.titleDrop} · %${(titleChance ?? 0).toLocaleString('tr-TR')}`, inline: true }] : [])
    );
  if (detail === 'detay') {
    embed.addFields(
      { name: '🧭 Savaş kuralları', value: [
        boss.noHpScaling ? 'HP oyuncu seviyesi ve takım büyüklüğüne göre ölçeklenmez.' : 'HP, baskın ölçeklendirme kurallarına tabi olabilir.',
        boss.regenerateDamagePerSecond ? 'Verilen hasar bir saniyelik yenilenme döngüsünde geri alınır.' : null,
        Number(boss.areaDamagePerSecond) > 0 ? `Alan hasarı: saniyede ${boss.areaDamagePerSecond} temel hasar.` : null,
        isZeldeila ? 'HP tabanı 1; bu boss öldürülemez.' : null,
        bossClass === 'Infinity' ? 'Infinity sınıfı: benzersiz üst seviye raid kategorisi; standart boss sınıflarından ayrıdır.' : null,
        isDomaltazor ? 'Katun Yüzüğü yalnızca bu bossun nadir ganimetidir; pazara konulamaz ve parçalanamaz.' : null,
        isTheFool ? 'Kader Oyunu her 3 turda tetiklenir: Talih (takım iyileştirmesi), Talihsizlik (takım alan hasarı) veya Joker (mana tüketimi ve ek alan hasarı). Üç sonuç eşit olasılıklıdır.' : null,
        boss.id === 'fallen-mage' ? 'Formlar HP eşiklerinde açılır. Üç mühür Zoltraak ile çözülür; tamamlanırsa %15 ihtimalle gizli form uyanır. Kanat kırılması, ruh ikizleri, büyü bariyeri ve son direniş mekanikleri aktiftir.' : null,
        boss.id === 'fallen-mage' ? 'Form ganimetleri: Düşmüş Melek Kanatları (%8), Melek Aura’nın Işık Tacı (%5), Alacakaranlık Aura Kalıntısı (%2). Üç Formun Fatihi unvanı: %3.' : null
      ].filter(Boolean).join('\n'), inline: false }
    );
  }
  return embed.setFooter({ text: 'Poğaça Frieren • Raid boss kataloğu' });
}

export default {
  data: new SlashCommandBuilder()
    .setName('raidbossbilgi')
    .setDescription('Raid bossların özelliklerini ve ganimetlerini baskın öncesi incele.')
    .addStringOption(option => option
      .setName('boss')
      .setDescription('Bilgilerini görmek istediğin raid boss')
      .setRequired(true)
      .addChoices(...bossChoices))
    .addStringOption(option => option
      .setName('gorunum')
      .setDescription('Bilgi kartının ayrıntı seviyesi')
      .setRequired(false)
      .addChoices(
        { name: 'Özet', value: 'ozet' },
        { name: 'Tüm savaş ayrıntıları', value: 'detay' }
      )),

  async execute(interaction) {
    const bossId = interaction.options.getString('boss', true);
    const detail = interaction.options.getString('gorunum') || 'ozet';
    let catalog = RAID_BOSSES;
    if (interaction.guildId) {
      try {
        const configured = await getGuildRpgContent(pool, interaction.guildId, 'raid_boss');
        if (Array.isArray(configured) && configured.length) catalog = configured;
      } catch (error) {
        console.warn('Raid boss bilgi kataloğu varsayılan listeyle açıldı:', error?.message || error);
      }
    }
    const boss = catalog.find(item => item.id === bossId) || RAID_BOSSES.find(item => item.id === bossId);
    if (!boss) {
      return interaction.reply({ content: 'Bu boss katalogda bulunamadı. Komut seçeneklerini yenileyip tekrar dene.', flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ embeds: [formatBoss(boss, detail)], flags: MessageFlags.Ephemeral });
  }
};
