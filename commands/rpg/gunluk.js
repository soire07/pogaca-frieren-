import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { pool, ensureUser } from '../../database/db.js';
import { JOURNAL_COLLECTIONS } from '../../gameplay-depth.js';
import { getJournalEntries, getClaimedJournalCollections, recordJournalEntry, claimJournalCollection } from '../../gameplay-journal.js';

function progressBar(value, total, width = 12) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
  const filled = Math.round(ratio * width);
  return `${'▰'.repeat(filled)}${'▱'.repeat(width - filled)}`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('gunluk')
    .setDescription('Macera ilerlemeni ve koleksiyon hedeflerini görüntüle.'),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({
        content: 'Macera günlüğü yalnızca bir Discord sunucusunda kullanılabilir.',
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await ensureUser(interaction.guildId, interaction.user.id);
      const { rows } = await pool.query(
        `SELECT level, xp, coins, exploration_count, boss_defeats, dungeon_wins,
                dungeon_runs
         FROM users
         WHERE guild_id = $1 AND user_id = $2`,
        [interaction.guildId, interaction.user.id]
      );

      const player = rows[0];
      if (!player) {
        return interaction.editReply('Oyuncu kaydı bulunamadı. Lütfen komutu tekrar dene.');
      }

      const { rows: masteryRows } = await pool.query(
        `SELECT region_key, visits
         FROM exploration_region_mastery
         WHERE guild_id = $1 AND user_id = $2
         ORDER BY visits DESC, region_key ASC`,
        [interaction.guildId, interaction.user.id]
      );

      const totalRegionVisits = masteryRows.reduce((sum, row) => sum + Number(row.visits || 0), 0);
      const regionText = masteryRows.length
        ? masteryRows.slice(0, 6).map(row => `• **${row.region_key}** — ${Number(row.visits)} ziyaret`).join('\n')
        : 'Henüz bölge ustalığı kaydın yok. Keşfe çıkarak günlüğünü başlat.';

      const statsEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📖 ${interaction.user.username} • Macera Günlüğü`)
        .setDescription('Yolculuğunun özeti ve tamamlamayı hedefleyebileceğin koleksiyonlar.')
        .addFields(
          {
            name: '🧭 Karakter',
            value: `Seviye: **${player.level}**\nXP: **${player.xp}**\nAltın: **${player.coins}**`,
            inline: true
          },
          {
            name: '⚔️ Başarılar',
            value: `Keşif: **${player.exploration_count}**\nBoss zaferi: **${player.boss_defeats}**\nZindan zaferi: **${player.dungeon_wins}/${player.dungeon_runs}**`,
            inline: true
          },
          {
            name: `🗺️ Bölge ustalığı • ${totalRegionVisits} ziyaret`,
            value: regionText
          }
        );

      const { rows: spellRows } = await pool.query(
        'SELECT spell_key FROM learned_spells WHERE guild_id=$1 AND user_id=$2',
        [interaction.guildId, interaction.user.id]
      );
      for (const row of spellRows) {
        if (JOURNAL_COLLECTIONS.spells.keys.includes(row.spell_key)) {
          await recordJournalEntry(pool, interaction.guildId, interaction.user.id, 'spells', row.spell_key);
        }
      }

      const relicAliases = new Map([
        ['🥐 Büyülü Poğaça Kutusu', 'Büyülü Poğaça Kutusu'],
        ['📖 Yasak Büyü Kitabı', 'Yasak Büyü Kitabı'],
        ['🐉 Ejderha Pulu', 'Ejderha Pulu'],
        ['🌙 Efsunlu Elf Yadigârı', 'Efsunlu Elf Yadigârı'],
        ['👑 Himmel’in Efsanevi Yadigârı', 'Himmel’in Efsanevi Yadigârı']
      ]);
      const { rows: inventoryRows } = await pool.query(
        'SELECT item_key FROM inventory WHERE guild_id=$1 AND user_id=$2 AND quantity>0',
        [interaction.guildId, interaction.user.id]
      );
      for (const row of inventoryRows) {
        const relicKey = relicAliases.get(row.item_key);
        if (relicKey && JOURNAL_COLLECTIONS.relics.keys.includes(relicKey)) {
          await recordJournalEntry(pool, interaction.guildId, interaction.user.id, 'relics', relicKey);
        }
      }

      const [journalEntries, claimedCollections] = await Promise.all([
        getJournalEntries(pool, interaction.guildId, interaction.user.id),
        getClaimedJournalCollections(pool, interaction.guildId, interaction.user.id)
      ]);
      const collected = new Map();
      for (const entry of journalEntries) {
        if (!collected.has(entry.collection_key)) collected.set(entry.collection_key, new Set());
        collected.get(entry.collection_key).add(entry.entry_key);
      }

      const newlyClaimed = [];
      for (const [key, collection] of Object.entries(JOURNAL_COLLECTIONS)) {
        const found = collected.get(key) || new Set();
        const complete = collection.keys.every(entryKey => found.has(entryKey));
        if (complete && !claimedCollections.has(key)) {
          const didClaim = await claimJournalCollection(pool, interaction.guildId, interaction.user.id, key, collection.reward);
          if (didClaim) newlyClaimed.push(`${collection.label}: +${collection.reward.coins} altın, +${collection.reward.xp} XP`);
        }
      }

      const collectionText = Object.entries(JOURNAL_COLLECTIONS).map(([key, collection]) => {
        const found = collected.get(key) || new Set();
        const count = collection.keys.filter(entryKey => found.has(entryKey)).length;
        const claimed = claimedCollections.has(key) || newlyClaimed.some(line => line.startsWith(collection.label + ':'));
        const state = claimed ? ' · ödül alındı' : count === collection.keys.length ? ' · ödül hazır' : '';
        return `**${collection.label}**\n${progressBar(count, collection.keys.length)} ${count}/${collection.keys.length} kayıt${state}`;
      }).join('\n\n');

      statsEmbed.addFields({
        name: '📚 Koleksiyon hedefleri',
        value: collectionText.slice(0, 1024)
      });
      if (newlyClaimed.length) statsEmbed.addFields({ name: '🎁 Koleksiyon ödülleri', value: newlyClaimed.join('\n').slice(0, 1024) });
      statsEmbed.setFooter({ text: 'Poğaça Frieren • Koleksiyon ilerlemesi kalıcı kaydedilir.' });

      return interaction.editReply({ embeds: [statsEmbed] });
    } catch (error) {
      console.error('Macera günlüğü komutu başarısız:', error);
      return interaction.editReply('Macera günlüğü okunamadı. Lütfen daha sonra tekrar dene.');
    }
  }
};
