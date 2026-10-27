import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';

export const learnableSpells = [
  { key: 'barrier', name: 'Koruyucu Bariyer', level: 3, price: 180, description: 'Bir sonraki savaş hazırlığında savunma odaklı büyü pratiği.' },
  { key: 'heilen', name: 'Heilen', level: 4, price: 260, description: 'Şifa büyüsü; ortak savaşlarda iyileştirme seçeneğiyle ilişkilidir.' },
  { key: 'wind_blade', name: 'Rüzgâr Bıçağı', level: 5, price: 320, description: 'Keskin bir rüzgâr akımı oluşturur.' },
  { key: 'ice_spear', name: 'Buz Mızrağı', level: 7, price: 450, description: 'Yoğunlaşmış buzdan bir mızrak meydana getirir.' },
  { key: 'fire_orb', name: 'Alev Küresi', level: 9, price: 600, description: 'Ateş enerjisini tek bir kürede toplar.' },
  { key: 'stone_wall', name: 'Taş Duvar', level: 11, price: 780, description: 'Taşlardan geçici bir siper oluşturur.' },
  { key: 'purification', name: 'Arındırma', level: 14, price: 1000, description: 'Zararlı büyü etkilerini temizlemeyi amaçlayan destek büyüsü.' },
  { key: 'lightning_chain', name: 'Yıldırım Zinciri', level: 18, price: 1400, description: 'Elektrik enerjisini zincir hâlinde yönlendirir.' }
];

export default {
  data: new SlashCommandBuilder()
    .setName('buyuogren')
    .setDescription('Seviyene ve altınına uygun yeni bir büyü öğren.')
    .addStringOption(option => option.setName('buyu').setDescription('Öğrenmek istediğin büyü').setRequired(true)
      .addChoices(...learnableSpells.map(spell => ({ name: `${spell.name} · Seviye ${spell.level} · ${spell.price} altın`, value: spell.key })))),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Büyü öğrenmek yalnızca sunucularda kullanılabilir.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const spellKey = interaction.options.getString('buyu', true);
    const spell = learnableSpells.find(item => item.key === spellKey);
    if (!spell) return interaction.editReply('Bu büyü kataloğunda bulunamadı.');
    const db = await pool.connect();
    try {
      await ensureUser(interaction.guildId, interaction.user.id);
      await db.query('BEGIN');
      const result = await db.query('SELECT level, coins FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', [interaction.guildId, interaction.user.id]);
      const user = result.rows[0];
      if (!user) { await db.query('ROLLBACK'); return interaction.editReply('Oyuncu kaydı bulunamadı; tekrar dene.'); }
      if (Number(user.level) < spell.level) { await db.query('ROLLBACK'); return interaction.editReply(`🔒 **${spell.name}** için ${spell.level}. seviye gerekiyor. Şu an ${user.level}. seviyedesin.`); }
      const existing = await db.query('SELECT 1 FROM learned_spells WHERE guild_id=$1 AND user_id=$2 AND spell_key=$3 FOR UPDATE', [interaction.guildId, interaction.user.id, spell.key]);
      if (existing.rowCount) { await db.query('ROLLBACK'); return interaction.editReply(`📖 **${spell.name}** büyüsünü zaten öğrendin.`); }
      if (Number(user.coins) < spell.price) { await db.query('ROLLBACK'); return interaction.editReply(`💰 Bu büyü ${spell.price} altın. Bakiyen: ${Number(user.coins)} altın.`); }
      await db.query('UPDATE users SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, interaction.user.id, spell.price]);
      await db.query('INSERT INTO learned_spells(guild_id,user_id,spell_key) VALUES($1,$2,$3)', [interaction.guildId, interaction.user.id, spell.key]);
      await db.query('INSERT INTO spell_mastery(guild_id,user_id,spell_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [interaction.guildId, interaction.user.id, spell.key]);
      await db.query('COMMIT');
      const embed = new EmbedBuilder().setColor(0x8f83e8).setTitle('📖 Yeni büyü öğrenildi').setDescription(`**${spell.name}** artık büyü listende.\n\n${spell.description}\n\n🪙 Harcanan: **${spell.price} altın**\n🔮 Kalan bakiye: **${Number(user.coins) - spell.price} altın**`).setFooter({ text: 'Büyü ustalığını geliştirmek için /buyupratik kullan.' });
      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      console.error('/buyuogren hatası:', error);
      return interaction.editReply('Büyü öğrenilemedi. Verilerin değiştirilmeden işlem geri alındı; daha sonra tekrar dene.');
    } finally { db.release(); }
  }
};
