import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from '../../database/db.js';

const bosses = [
  { level: 1, name: '🐺 Schattenwolf', region: 'Merkez Topraklar', hp: 120, damage: '7–12', special: 'Rudelstoß — her üçüncü turda ek hasar', rewards: '90–130 altın · 55–85 XP', loot: 'Schattenwolfzahn (%20 ihtimal)' },
  { level: 10, name: '🗿 Kadim Harabe Muhafızı', region: 'Kadim Harabeler', hp: 210, damage: '10–16', special: 'Kadim Sarsıntı — her üçüncü turda ek hasar', rewards: '150–210 altın · 95–140 XP', loot: 'Muhafız Rünü (%30 ihtimal)' },
  { level: 20, name: '👹 Kuzey İblisi', region: 'Kuzey Toprakları', hp: 330, damage: '13–20', special: 'Mana Kemiren Lanet — ek hasar verir ve Mana emer', rewards: '230–320 altın · 150–210 XP', loot: 'Kuzey İblisinin Kalbi (%35 ihtimal)' },
  { level: 35, name: '🩸 Büyük İblis Komutanı', region: 'Kuzey Yaylaları', hp: 470, damage: '16–24', special: 'Komutanın Hiddeti — her üçüncü turda ek hasar', rewards: '340–470 altın · 220–310 XP', loot: 'İblis Komutanının Kanı (%45 ihtimal)' },
  { level: 50, name: '👑 Äußerst Sınavının İblis Efendisi', region: 'Äußerst Sınav Rotası', hp: 650, damage: '20–29', special: 'Äußerst Büyü Patlaması — güçlü özel saldırı', rewards: '500–700 altın · 330–460 XP', loot: 'İblis Komutanının Kanı, Muhafız Rünü veya Kuzey İblisinin Kalbi (%55 ihtimal)' }
];

export default {
  data: new SlashCommandBuilder()
    .setName('bossrehberi')
    .setDescription('Boss kademelerini, ganimetleri ve savaş hazırlığını incele.'),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: '📜 Bu kayıt yalnızca bir sunucudaki maceracı ilerlemesini gösterebilir.', ephemeral: true });
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
      .setColor(0x6e5ab8)
      .setAuthor({ name: 'POĞAÇA FRIEREN • İBLİS AVCILARI KAYDI' })
      .setTitle('⚔️ Kuzey Seferi — Boss Rehberi')
      .setDescription(
        'Bir iblise meydan okumadan önce gücünü, ganimetini ve hazırlığını gözden geçir.\n\n' +
        '**Gezgin seviyesi:** ' + level + '  ·  **Boss zaferi:** ' + defeats + '\n' +
        '**Seviyene göre kademe:** ' + currentBoss.name + '\n' +
        (nextBoss ? '**Sonraki eşik:** ' + nextBoss.name + ' — seviye ' + nextBoss.level : '**Sonraki eşik:** Son boss kademesine ulaştın.')
      )
      .addFields(bosses.map((boss, index) => ({
        name: (level >= boss.level ? '🟣' : '🔒') + ' ' + (index + 1) + '. ' + boss.name + ' · Sv. ' + boss.level + '+',
        value:
          '**Bölge** · ' + boss.region + '\n' +
          '❤️ **HP** ' + boss.hp + '  ·  ⚔️ **Hasar** ' + boss.damage + '\n' +
          '💥 **Özel hareket** · ' + boss.special + '\n' +
          '🎁 **Zafer ödülü** · ' + boss.rewards + '\n' +
          '💎 **Nadir ganimet** · ' + boss.loot,
        inline: false
      })))
      .addFields(
        { name: '🧪 Savaştan önce hazırlık', value: '1. **/dinlen** ile HP ve Mana değerlerini yenile.\n2. **/market** üzerinden bütçene uygun ekipman al.\n3. **/ekipman** ile eşyalarını kuşan.\n4. **/buyular** ve **/buyuustaligi** ile savaş seçeneklerini kontrol et.', inline: false },
        { name: '⚔️ Meydan oku', value: 'Hazır olduğunda **/iblisavasi** komutunu kullan. Ortak savaş için **/ortakboss**; zindan yolculukları için **/zindan** veya **/katlizindan** komutlarını incele.', inline: false }
      )
      .setFooter({ text: 'Frieren’in kuzey seferi • Kademe seviyeleri rehber niteliğindedir; savaşa girmeden hazırlığını kontrol et.' });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
