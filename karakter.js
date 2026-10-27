import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { CHARACTER_CLASSES, CHARACTER_BUILDS, getCharacterBuild } from './rpg-mechanics.js';
import { xpForNextLevel } from './utils.js';
import characterDraw from './karaktercek.js';
import characterUpgrade from './karaktergelistir.js';

const classChoices = [
  { name: '✨ Büyücü', value: 'buyucu' },
  { name: '🛡️ Muhafız', value: 'muhafiz' },
  { name: '💚 Şifacı', value: 'sifaci' },
  { name: '🧭 Gezgin', value: 'gezgin' }
];
const buildChoices = [
  { name: '⚖️ Dengeli', value: 'dengeli' },
  { name: '⚔️ Avcı', value: 'avci' },
  { name: '🛡️ Muhafız', value: 'muhafiz' },
  { name: '🔮 Büyücü', value: 'buyucu' }
];
const statChoices = [
  { name: '❤️ Can (+10 maksimum can / puan)', value: 'hp' },
  { name: '🔮 Mana (+10 maksimum mana / puan)', value: 'mana' },
  { name: '⚔️ Saldırı (+2 / puan)', value: 'attack' },
  { name: '🛡️ Savunma (+1 / puan)', value: 'defense' }
];
const classDetails = {
  buyucu: 'Büyü hasarı +%8, büyü mana maliyeti -%10.',
  muhafiz: 'Savunma etkisi +%12.',
  sifaci: 'İyileştirme etkisi +%20.',
  gezgin: 'Dengeli başlangıç sınıfı; özel sınıf çarpanı yok.'
};
const classLabels = Object.fromEntries(Object.entries(CHARACTER_CLASSES).map(([key, value]) => [key, value.label]));

export default {
  data: new SlashCommandBuilder()
    .setName('karakter')
    .setDescription('Maceracını oluştur, sınıfını ve yapını seç; bütün RPG bilgilerini tek panelden yönet.')
    .addSubcommand(s => s.setName('panel').setDescription('Karakter kartını ve ilerlemeni göster.'))
    .addSubcommand(s => s.setName('olustur').setDescription('Kendi maceracını oluştur.')
      .addStringOption(o => o.setName('isim').setDescription('Karakterinin oyun içi adı').setRequired(true).setMinLength(2).setMaxLength(24))
      .addStringOption(o => o.setName('sinif').setDescription('Maceracı sınıfın').setRequired(true).addChoices(...classChoices)))
    .addSubcommand(s => s.setName('sinif').setDescription('Karakter sınıfını değiştir.')
      .addStringOption(o => o.setName('secim').setDescription('Sınıfını seç').setRequired(true).addChoices(...classChoices)))
    .addSubcommand(s => s.setName('yapi').setDescription('Savaş yapını seç.')
      .addStringOption(o => o.setName('secim').setDescription('Oyun tarzını seç').setRequired(true).addChoices(...buildChoices)))
    .addSubcommand(s => s.setName('isim').setDescription('Karakterinin adını değiştir.')
      .addStringOption(o => o.setName('yeni_isim').setDescription('Yeni karakter adı').setRequired(true).setMinLength(2).setMaxLength(24)))
    .addSubcommand(s => s.setName('gelisim').setDescription('Seviye puanlarını karakter özelliklerine yatır.')
      .addStringOption(o => o.setName('ozellik').setDescription('Geliştirilecek özellik').setRequired(true).addChoices(...statChoices))
      .addIntegerOption(o => o.setName('puan').setDescription('Harcanacak puan').setRequired(true).setMinValue(1).setMaxValue(50)))
    .addSubcommand(s => s.setName('cek').setDescription('Günlük ücretsiz anime karakterini koleksiyonuna kat.'))
    .addSubcommand(s => s.setName('gelistir').setDescription('Koleksiyonundaki anime karakterini güçlendir.')
      .addStringOption(o => o.setName('karakter').setDescription('Geliştirmek istediğin karakter').setRequired(true).setAutocomplete(true))
      .addBooleanOption(o => o.setName('yukselt').setDescription('Evet seçersen altın harcayıp yükseltir.').setRequired(false))),

  async autocomplete(interaction) {
    if (interaction.options.getSubcommand() === 'gelistir') return characterUpgrade.autocomplete(interaction);
    return interaction.respond([]);
  },

  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Karakter ekranı yalnızca sunucularda kullanılabilir.', ephemeral: true });
    const sub = interaction.options.getSubcommand();
    if (sub === 'cek') return characterDraw.execute(interaction);
    if (sub === 'gelistir') return characterUpgrade.execute(interaction);
    await ensureUser(interaction.guildId, interaction.user.id);

    if (sub === 'olustur') {
      const name = interaction.options.getString('isim', true).trim();
      const classKey = interaction.options.getString('sinif', true);
      if (name.length < 2 || /[\n\r<>@]/.test(name)) return interaction.reply({ content: 'Karakter adı 2–24 karakter olmalı; satır sonu, etiket veya @ içermemeli.', ephemeral: true });
      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        const { rows: [player] } = await db.query('SELECT character_name FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', [interaction.guildId, interaction.user.id]);
        if (player?.character_name) {
          await db.query('ROLLBACK');
          return interaction.reply({ content: `Zaten **${player.character_name}** adında bir maceracın var. Adını değiştirmek için /karakter isim komutunu kullan.`, ephemeral: true });
        }
        await db.query('UPDATE users SET character_name=$3,class_name=$4 WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, interaction.user.id, name, classLabels[classKey]]);
        await db.query('COMMIT');
        const profile = CHARACTER_CLASSES[classKey];
        const embed = new EmbedBuilder().setColor(0x9b8cff).setTitle('🌠 Yolculuğun başlıyor')
          .setDescription(`**${name}** — ${profile.label}\n\n${profile.description}\n${classDetails[classKey]}\n\nFrieren’in dünyasında her yolculuk küçük bir adımla başlar. İlk keşfine çıkmadan önce **/karakter panel** ekranını aç.`)
          .addFields({ name: '🧭 Başlangıç rotası', value: '/karakter panel → /gunlukodul → /kesif → /profil' })
          .setFooter({ text: 'Poğaça Frieren • Karakterin bu sunucudaki macerana bağlıdır.' });
        return interaction.reply({ embeds: [embed] });
      } catch (error) {
        await db.query('ROLLBACK').catch(() => {});
        console.error('/karakter olustur hatası:', error);
        return interaction.reply({ content: 'Karakter oluşturulamadı. Biraz sonra tekrar dene.', ephemeral: true }).catch(() => {});
      } finally { db.release(); }
    }

    if (sub === 'sinif' || sub === 'yapi' || sub === 'isim') {
      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        const { rows: [player] } = await db.query('SELECT character_name,class_name,active_build FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', [interaction.guildId, interaction.user.id]);
        if (!player?.character_name) {
          await db.query('ROLLBACK');
          return interaction.reply({ content: 'Önce `/karakter olustur` ile maceracını oluştur.', ephemeral: true });
        }
        if (sub === 'sinif') {
          const key = interaction.options.getString('secim', true);
          await db.query('UPDATE users SET class_name=$3 WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, interaction.user.id, classLabels[key]]);
          await db.query('COMMIT');
          return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x9b8cff).setTitle('🧭 Sınıf değiştirildi').setDescription(`**${player.character_name}** artık **${classLabels[key]}**.\n${CHARACTER_CLASSES[key].description}\n\n${classDetails[key]}`).setFooter({ text: 'Poğaça Frieren • Sınıfını daha sonra yeniden seçebilirsin.' })] });
        }
        if (sub === 'yapi') {
          const key = interaction.options.getString('secim', true);
          await db.query('UPDATE users SET active_build=$3 WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, interaction.user.id, key]);
          await db.query('COMMIT');
          const build = CHARACTER_BUILDS[key];
          return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x9b8cff).setTitle('⚔️ Savaş yapısı güncellendi').setDescription(`**${player.character_name}** — ${build.label}\n${build.description}\n\nYapı bonusları karakter panelinde ve savaş hesaplarında uygulanır.`).setFooter({ text: 'Poğaça Frieren • İhtiyacına göre yapını değiştir.' })] });
        }
        const name = interaction.options.getString('yeni_isim', true).trim();
        if (name.length < 2 || /[\n\r<>@]/.test(name)) {
          await db.query('ROLLBACK');
          return interaction.reply({ content: 'Karakter adı 2–24 karakter olmalı; satır sonu, etiket veya @ içermemeli.', ephemeral: true });
        }
        await db.query('UPDATE users SET character_name=$3 WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, interaction.user.id, name]);
        await db.query('COMMIT');
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x9b8cff).setTitle('📜 Yeni bir isim, aynı yolculuk').setDescription(`Maceracının adı artık **${name}**.`).setFooter({ text: 'Poğaça Frieren • İlerlemen korunur.' })] });
      } catch (error) {
        await db.query('ROLLBACK').catch(() => {});
        console.error('/karakter ayar hatası:', error);
        return interaction.reply({ content: 'Karakter ayarı güncellenemedi. Biraz sonra tekrar dene.', ephemeral: true }).catch(() => {});
      } finally { db.release(); }
    }

    if (sub === 'gelisim') {
      const stat = interaction.options.getString('ozellik', true);
      const points = interaction.options.getInteger('puan', true);
      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        const { rows: [player] } = await db.query('SELECT character_name,stat_points,hp,max_hp,mana,max_mana,attack,defense FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', [interaction.guildId, interaction.user.id]);
        if (!player?.character_name) {
          await db.query('ROLLBACK');
          return interaction.reply({ content: 'Önce `/karakter olustur` ile maceracını oluştur.', ephemeral: true });
        }
        if (Number(player.stat_points) < points) {
          await db.query('ROLLBACK');
          return interaction.reply({ content: `Yeterli gelişim puanın yok. Kullanılabilir puanın: **${player.stat_points}**.`, ephemeral: true });
        }
        const current = Number(player[stat === 'hp' ? 'max_hp' : stat === 'mana' ? 'max_mana' : stat]);
        const increase = stat === 'hp' || stat === 'mana' ? points * 10 : stat === 'attack' ? points * 2 : points;
        const cap = stat === 'hp' || stat === 'mana' ? 2000 : stat === 'attack' ? 500 : 250;
        if (current + increase > cap) {
          await db.query('ROLLBACK');
          return interaction.reply({ content: `Bu geliştirme üst sınırı aşar. Bu özellik için üst sınır **${cap}**.`, ephemeral: true });
        }
        if (stat === 'hp') await db.query('UPDATE users SET max_hp=max_hp+$3,hp=LEAST(max_hp+$3,hp+$3),stat_points=stat_points-$4 WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, interaction.user.id, increase, points]);
        else if (stat === 'mana') await db.query('UPDATE users SET max_mana=max_mana+$3,mana=LEAST(max_mana+$3,mana+$3),stat_points=stat_points-$4 WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, interaction.user.id, increase, points]);
        else if (stat === 'attack') await db.query('UPDATE users SET attack=attack+$3,stat_points=stat_points-$4 WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, interaction.user.id, increase, points]);
        else await db.query('UPDATE users SET defense=defense+$3,stat_points=stat_points-$4 WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, interaction.user.id, increase, points]);
        const { rows: [updated] } = await db.query('SELECT stat_points,hp,max_hp,mana,max_mana,attack,defense FROM users WHERE guild_id=$1 AND user_id=$2', [interaction.guildId, interaction.user.id]);
        await db.query('COMMIT');
        const embed = new EmbedBuilder().setColor(0x9b8cff).setTitle('✨ Karakter gelişimi tamamlandı')
          .setDescription(`**${points}** gelişim puanı harcandı.`)
          .addFields(
            { name: '❤️ Can', value: `${updated.hp}/${updated.max_hp}`, inline: true },
            { name: '🔮 Mana', value: `${updated.mana}/${updated.max_mana}`, inline: true },
            { name: '⚔️ Saldırı', value: String(updated.attack), inline: true },
            { name: '🛡️ Savunma', value: String(updated.defense), inline: true },
            { name: '🌟 Kalan puan', value: String(updated.stat_points), inline: true }
          ).setFooter({ text: 'Poğaça Frieren • Her seviye yeni bir seçimdir.' });
        return interaction.reply({ embeds: [embed] });
      } catch (error) {
        await db.query('ROLLBACK').catch(() => {});
        console.error('/karakter gelisim hatası:', error);
        return interaction.reply({ content: 'Gelişim uygulanamadı. Biraz sonra tekrar dene.', ephemeral: true }).catch(() => {});
      } finally { db.release(); }
    }

    const { rows: [u] } = await pool.query(
      `SELECT character_name,xp,level,coins,class_name,active_build,hp,max_hp,mana,max_mana,attack,defense,stat_points,boss_defeats,exploration_count
       FROM users WHERE guild_id=$1 AND user_id=$2`,
      [interaction.guildId, interaction.user.id]
    );
    if (!u?.character_name) {
      const embed = new EmbedBuilder().setColor(0x9b8cff).setTitle('🌠 Yeni maceracı, ilk adımını at')
        .setDescription('Henüz bir karakter oluşturmadın. Kendine bir isim ve sınıf seç; Frieren’in dünyasındaki yolculuğun başlasın.')
        .addFields(
          { name: '🪶 1. Karakter oluştur', value: '`/karakter olustur` — isim ve sınıf seç.' },
          { name: '🧭 2. İlk keşif', value: '`/kesif` — Merkez Topraklar ile başla.' },
          { name: '📖 3. Rehber', value: '`/rehber` — tüm oyun sistemlerini öğren.' }
        ).setFooter({ text: 'Poğaça Frieren • Her macera bir isimle başlar.' });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    const xpNeeded = xpForNextLevel(Number(u.level));
    const previousThreshold = xpForNextLevel(Math.max(0, Number(u.level) - 1));
    const xpProgress = Math.max(0, Number(u.xp) - previousThreshold);
    const xpSpan = Math.max(1, xpNeeded - previousThreshold);
    const hpBar = bar(Number(u.hp), Number(u.max_hp));
    const manaBar = bar(Number(u.mana), Number(u.max_mana));
    const xpBar = bar(xpProgress, xpSpan);
    const build = getCharacterBuild(u.active_build);
    const nextLevel = Math.max(0, xpNeeded - Number(u.xp));
    const classKey = Object.keys(CHARACTER_CLASSES).find(key => CHARACTER_CLASSES[key].label === u.class_name) || 'gezgin';
    const classBonus = classDetails[classKey];
    const hpRatio = Number(u.hp) / Math.max(1, Number(u.max_hp));
    const manaRatio = Number(u.mana) / Math.max(1, Number(u.max_mana));
    const nextAction = hpRatio < 0.35
      ? '❤️ Canın azalmış. **/dinlen** ile toparlanıp sonra savaşa çık.'
      : manaRatio < 0.25
        ? '🔮 Manan düşük. **/dinlen** ile büyü gücünü yenile.'
        : Number(u.stat_points) > 0
          ? '🌟 Dağıtılmamış gelişim puanın var. **/karakter gelisim** ile gücünü artır.'
          : Number(u.exploration_count) === 0
            ? '🧭 Yolculuğun yeni başlıyor. **/kesif** ile ilk bölgeyi keşfet.'
            : '⚔️ Hazırsın! **/iblisavasi** ile gücünü sına veya **/kesif** ile yeni yerler bul.';
    const embed = new EmbedBuilder().setColor(0x9b8cff)
      .setAuthor({ name: '✦ POĞAÇA FRIEREN  /  MACERACI DOSYASI' })
      .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
      .setTitle(`🌠 ${u.character_name}`)
      .setDescription(
        `*“Her yolculuk, henüz tanımadığın bir dünyaya atılan ilk adımdır.”*\n\n` +
        `**${classLabelsByName(u.class_name)}**  ·  **Seviye ${u.level}**\n` +
        `${build.label} — ${build.description}\n\n` +
        `${classBonus}`
      )
      .addFields(
        { name: '❤️ CAN DURUMU', value: `${hpBar}\n**${u.hp} / ${u.max_hp}**`, inline: true },
        { name: '🔮 MANA AKIŞI', value: `${manaBar}\n**${u.mana} / ${u.max_mana}**`, inline: true },
        { name: '✨ SEVİYE YOLCULUĞU', value: `${xpBar}\n**${u.xp} XP** · Sonraki seviye için **${nextLevel} XP**`, inline: false },
        { name: '⚔️ SALDIRI', value: `**${u.attack}**\nTemel saldırı gücü`, inline: true },
        { name: '🛡️ SAVUNMA', value: `**${u.defense}**\nDarbeleri azaltır`, inline: true },
        { name: '🌟 GELİŞİM PUANI', value: `**${u.stat_points}**\nDağıtılmayı bekliyor`, inline: true },
        { name: '🪙 HAZİNE', value: `**${Number(u.coins).toLocaleString('tr-TR')}** altın`, inline: true },
        { name: '👹 BOSS ZAFERLERİ', value: `**${u.boss_defeats}**\nYenilen güçlü düşman`, inline: true },
        { name: '🗺️ KEŞİF KAYDI', value: `**${u.exploration_count}**\nTamamlanan keşif`, inline: true },
        { name: '📜 SIRADAKİ ADIMIN', value: nextAction, inline: false },
        { name: '🎮 KARAKTERİNİ YÖNET', value: '`/karakter isim` · `/karakter sinif` · `/karakter yapi` · `/karakter gelisim`', inline: false }
      )
      .setFooter({ text: 'Poğaça Frieren • Bu dosya senin yolculuğunu anlatır.' });
    return interaction.reply({ embeds: [embed] });
  }
};

function bar(current, maximum) {
  const max = Math.max(1, Number(maximum) || 1);
  const ratio = Math.max(0, Math.min(1, Number(current) / max));
  const filled = Math.round(ratio * 10);
  return '▰'.repeat(filled) + '▱'.repeat(10 - filled);
}
function classLabelsByName(value) {
  return Object.values(CHARACTER_CLASSES).find(profile => profile.label === value)?.label || value || 'Gezgin';
}
