import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { CHARACTER_BUILDS, getCharacterBuild } from './rpg-mechanics.js';

export default {
  internalOnly: true,
  data: new SlashCommandBuilder()
    .setName('karakteryapisi')
    .setDescription('Savaş tarzını seç ve saldırı, savunma, HP ile mana bonuslarını belirle.')
    .addStringOption(option => option
      .setName('yapi')
      .setDescription('Kullanmak istediğin savaş tarzı')
      .setRequired(false)
      .addChoices(
        { name: '⚖️ Dengeli', value: 'dengeli' },
        { name: '⚔️ Avcı — +%20 saldırı, -%10 savunma', value: 'avci' },
        { name: '🛡️ Muhafız — +%20 HP ve savunma, -%10 saldırı', value: 'muhafiz' },
        { name: '🔮 Büyücü — +%25 mana, +%10 saldırı, -%10 savunma', value: 'buyucu' }
      )),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Karakter yapıları yalnızca sunucularda kullanılabilir.', ephemeral: true });
    await ensureUser(interaction.guildId, interaction.user.id);
    const selected = interaction.options.getString('yapi');
    if (selected) {
      await pool.query('UPDATE users SET active_build=$3 WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, interaction.user.id, selected]);
    }
    const result = await pool.query('SELECT active_build, attack, defense, max_hp, max_mana FROM users WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, interaction.user.id]);
    const row = result.rows[0];
    const key = CHARACTER_BUILDS[row.active_build] ? row.active_build : 'dengeli';
    const active = getCharacterBuild(key);
    const embed = new EmbedBuilder()
      .setColor(0x9b8cff)
      .setTitle('🧭 Karakter Savaş Yapın')
      .setDescription(selected ? `Savaş yapın **${active.label}** olarak kaydedildi. Bonuslar solo iblis savaşında, ortak boss baskınında ve katlı zindanda uygulanır.` : `Aktif savaş yapın: **${active.label}**\n${active.description}\n\nYeni bir yapı seçmek için komutu **yapi** seçeneğiyle yeniden kullan.`)
      .addFields(
        ...Object.entries(CHARACTER_BUILDS).map(([value, build]) => ({
          name: `${build.label} ${value === key ? '• AKTİF' : ''}`,
          value: `${build.description}\n⚔️ Saldırı: ${Math.round((build.attack - 1) * 100)}% · 🛡️ Savunma: ${Math.round((build.defense - 1) * 100)}%\n❤️ Maksimum HP: ${Math.round((build.hp - 1) * 100)}% · 🔮 Maksimum mana: ${Math.round((build.mana - 1) * 100)}%`,
          inline: false
        }))
      )
      .setFooter({ text: 'Poğaça Frieren • Tarzını seç, Kuzey yolculuğuna hazırlan.' });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
