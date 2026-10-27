import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';

const goals = [
  { key: 'level', title: 'Yeni bir güç seviyesi', description: 'Seviye 10 ol', target: 10, field: 'level', reward: 'İlerlemeni /profil ile takip et' },
  { key: 'bosses', title: 'İblis avcısı', description: '5 iblisi yen', target: 5, field: 'boss_defeats', reward: 'İblis savaşlarına katıl' },
  { key: 'dungeons', title: 'Zindan uzmanı', description: '3 zindan zaferi kazan', target: 3, field: 'dungeon_wins', reward: 'Bir arkadaşınla zindanlara gir' },
  { key: 'exploration', title: 'Kuzeyin kâşifi', description: '10 keşif tamamla', target: 10, field: 'exploration_count', reward: 'Yeni bölgeleri keşfet' },
  { key: 'collection', title: 'Karakter koleksiyoncusu', description: '10 farklı anime karakteri topla', target: 10, field: 'unique_characters', reward: 'Karakter çekimlerini kullan' },
  { key: 'spells', title: 'Büyü öğrencisi', description: '3 büyü öğren', target: 3, field: 'learned_spells', reward: 'Büyü kitabını geliştir' }
];

export default {
  data: new SlashCommandBuilder()
    .setName('hedefler')
    .setDescription('RPG gelişim hedeflerini ve ilerleme durumunu göster.')
    .addUserOption(option => option
      .setName('kullanici')
      .setDescription('Hedeflerini görmek istediğin oyuncu')
      .setRequired(false)),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', ephemeral: true });
    }
    await interaction.deferReply();
    const target = interaction.options.getUser('kullanici') ?? interaction.user;

    try {
      await ensureUser(interaction.guildId, target.id);
      const [userResult, collectionResult, spellResult] = await Promise.all([
        pool.query(
          'SELECT level, boss_defeats, dungeon_wins, exploration_count FROM users WHERE guild_id=$1 AND user_id=$2',
          [interaction.guildId, target.id]
        ),
        pool.query(
          'SELECT COUNT(*)::int AS total FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2',
          [interaction.guildId, target.id]
        ),
        pool.query(
          'SELECT COUNT(*)::int AS total FROM learned_spells WHERE guild_id=$1 AND user_id=$2',
          [interaction.guildId, target.id]
        )
      ]);
      const u = userResult.rows[0];
      if (!u) return interaction.editReply('Hedef bilgileri bulunamadı.');
      const values = {
        level: Number(u.level),
        bosses: Number(u.boss_defeats),
        dungeons: Number(u.dungeon_wins),
        exploration: Number(u.exploration_count),
        collection: Number(collectionResult.rows[0]?.total ?? 0),
        spells: Number(spellResult.rows[0]?.total ?? 0)
      };
      const lines = goals.map(goal => {
        const current = Math.min(goal.target, values[goal.key]);
        const percent = Math.floor(current / goal.target * 100);
        const filled = Math.round(percent / 10);
        const bar = '▰'.repeat(filled) + '▱'.repeat(10 - filled);
        const status = percent >= 100 ? '✅ Tamamlandı' : '🎯 Devam ediyor';
        return `**${goal.title}** — ${status}\n${goal.description}\n${bar} **${Math.min(values[goal.key], goal.target)}/${goal.target}** (${percent}%)`;
      });
      const completed = goals.filter(goal => values[goal.key] >= goal.target).length;
      const embed = new EmbedBuilder()
        .setColor(0xb58cff)
        .setTitle(`🎯 ${target.username} · Gelişim Hedefleri`)
        .setDescription(lines.join('\n\n'))
        .addFields({ name: 'Genel ilerleme', value: `**${completed}/${goals.length}** hedef tamamlandı`, inline: true })
        .setFooter({ text: 'Hedefler ilerlemeni takip eder; ödüller ilgili oyun sistemlerinden kazanılır.' })
        .setTimestamp();
      return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    } catch (error) {
      console.error('/hedefler hatası:', error);
      return interaction.editReply('Gelişim hedefleri yüklenemedi. Biraz sonra tekrar dene.');
    }
  }
};
