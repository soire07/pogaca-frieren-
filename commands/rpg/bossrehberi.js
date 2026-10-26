import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from '../../database/db.js';

const bosses = [
  {
    level: 1,
    name: '🐺 Schattenwolf',
    region: 'Merkez Topraklar',
    hp: 120,
    damage: '7–12',
    special: 'Rudelstoß — her üçüncü turda ek hasar',
    rewards: '90–130 altın · 55–85 XP',
    loot: 'Schattenwolfzahn (%20 ihtimal)'
  },
  {
    level: 10,
    name: '🗿 Kadim Harabe Muhafızı',
    region: 'Kadim Harabeler',
    hp: 210,
    damage: '10–16',
    special: 'Kadim Sarsıntı — her üçüncü turda ek hasar',
    rewards: '150–210 altın · 95–140 XP',
    loot: 'Muhafız Rünü (%30 ihtimal)'
  },
  {
    level: 20,
    name: '👹 Kuzey İblisi',
    region: 'Kuzey Toprakları',
    hp: 330,
    damage: '13–20',
    special: 'Mana Kemiren Lanet — ek hasar verir ve Mana emer',
    rewards: '230–320 altın · 150–210 XP',
    loot: 'Kuzey İblisinin Kalbi (%35 ihtimal)'
  },
  {
    level: 35,
    name: '🩸 Büyük İblis Komutanı',
    region: 'Kuzey Yaylaları',
    hp: 470,
    damage: '16–24',
    special: 'Komutanın Hiddeti — her üçüncü turda ek hasar',
    rewards: '340–470 altın · 220–310 XP',
    loot: 'İblis Komutanının Kanı (%45 ihtimal)'
  },
  {
    level: 50,
    name: '👑 Äußerst Sınavının İblis Efendisi',
    region: 'Äußerst Sınav Rotası',
    hp: 650,
    damage: '20–29',
    special: 'Äußerst Büyü Patlaması — güçlü özel saldırı',
    rewards: '500–700 altın · 330–460 XP',
    loot: 'İblis Komutanının Kanı, Muhafız Rünü veya Kuzey İblisinin Kalbi (%55 ihtimal)'
  }
];

export default {
  data: new SlashCommandBuilder()
    .setName('bossrehberi')
    .setDescription('Frieren evrenindeki bossları, ödülleri ve kendi ilerlemeni incele.'),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Boss rehberi yalnızca sunucularda kullanılabilir.', ephemeral: true });
    }

    await ensureUser(interaction.guildId, interaction.user.id);
    const result = await pool.query(
      'SELECT level, boss_defeats FROM users WHERE guild_id=$1 AND user_id=$2',
      [interaction.guildId, interaction.user.id]
    );
    const player = result.rows[0] || { level: 1, boss_defeats: 0 };
    const level = Number(player.level || 1);
    const defeats = Number(player.boss_defeats || 0);
    const currentBoss = [...bosses].reverse().find(boss => level >= boss.level) || bosses[0];
    const nextBoss = bosses.find(boss => boss.level > level);

    const embed = new EmbedBuilder()
      .setColor(0x9b8cff)
      .setTitle('📖 İblis Avcısının Rehberi')
      .setDescription(
        `**Gezgin seviyesi:** ${level} · **Boss zaferi:** ${defeats}\n` +
        `**Şu anki boss:** ${currentBoss.name}\n` +
        (nextBoss ? `**Sıradaki boss:** ${nextBoss.name} · Seviye ${nextBoss.level}` : '**Son boss kademesine ulaştın.**')
      )
      .addFields(
        bosses.map((boss, index) => ({
          name: `${index + 1}. ${boss.name} · Seviye ${boss.level}+`,
          value:
            `📍 **Bölge:** ${boss.region}\n` +
            `❤️ **Can:** ${boss.hp} · ⚔️ **Hasar:** ${boss.damage}\n` +
            `💥 **Özel saldırı:** ${boss.special}\n` +
            `🎁 **Zafer ödülü:** ${boss.rewards}\n` +
            `💎 **Ganimet:** ${boss.loot}`,
          inline: false
        }))
      )
      .addFields({
        name: '🧙 Savaş hazırlığı',
        value: 'Canın veya Manan düşükse **/dinlen** kullan. **/market** üzerinden ekipman alıp **/ekipman** ile silah, zırh ve iki yüzük kuşan; bonuslar saldırı, savunma, maksimum HP ve Mana değerlerine yansır. Yeni büyüler için **/buyuogren**, büyü arşivi için **/buyular**, ustalık için **/buyuustaligi** kullan. Boss savaşı için **/iblisavasi** yaz.'
      })
      .setFooter({ text: 'Poğaça Frieren • Her zafer seni kuzeye bir adım daha yaklaştırır.' });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
