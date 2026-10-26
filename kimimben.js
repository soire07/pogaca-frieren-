import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { drawCharacter } from './character-data.js';

const BUTTON_TIMEOUT = 10 * 60 * 1000;



const rarityInfo = {
  Yaygın: { stars: '⭐' },
  Nadir: { stars: '⭐⭐' },
  Destansı: { stars: '⭐⭐⭐' },
  Efsanevi: { stars: '🌟🌟🌟🌟' }
};

async function claimDrawCooldown(guildId, userId) {
  const result = await pool.query(
    `UPDATE users
     SET character_draw_count =
           CASE WHEN character_draw_cooldown_until IS NOT NULL
                     AND character_draw_cooldown_until <= NOW()
                THEN 1 ELSE character_draw_count + 1 END,
         last_character_draw_at = NOW(),
         character_draw_cooldown_until =
           CASE WHEN (CASE WHEN character_draw_cooldown_until IS NOT NULL
                                AND character_draw_cooldown_until <= NOW()
                           THEN 1 ELSE character_draw_count + 1 END) >= 5
                THEN NOW() + INTERVAL '30 minutes'
                ELSE NULL END
     WHERE guild_id = $1 AND user_id = $2
       AND (character_draw_cooldown_until IS NULL OR character_draw_cooldown_until <= NOW())
       AND (last_character_draw_at IS NULL OR last_character_draw_at <= NOW() - INTERVAL '15 seconds')
       AND ((character_draw_cooldown_until IS NOT NULL AND character_draw_cooldown_until <= NOW())
            OR character_draw_count < 5)
     RETURNING character_draw_count, character_draw_cooldown_until`,
    [guildId, userId]
  );
  if (result.rowCount > 0) {
    return { ok: true, count: Number(result.rows[0].character_draw_count), cooldownUntil: result.rows[0].character_draw_cooldown_until };
  }
  const status = await pool.query(
    `SELECT character_draw_count, last_character_draw_at, character_draw_cooldown_until
     FROM users WHERE guild_id = $1 AND user_id = $2`,
    [guildId, userId]
  );
  const row = status.rows[0];
  if (row?.character_draw_cooldown_until && new Date(row.character_draw_cooldown_until) > new Date()) {
    return { ok: false, reason: 'limit', cooldownUntil: row.character_draw_cooldown_until };
  }
  if (row?.last_character_draw_at) {
    const remainingMs = 15000 - (Date.now() - new Date(row.last_character_draw_at).getTime());
    if (remainingMs > 0) return { ok: false, reason: 'wait', remainingSeconds: Math.ceil(remainingMs / 1000) };
  }
  return { ok: false, reason: 'limit', cooldownUntil: null };
}

function cooldownMessage(result) {
  if (result.reason === 'wait') return `Yeni karakter çekmeden önce **${result.remainingSeconds} saniye** beklemelisin.`;
  if (result.cooldownUntil) {
    const unix = Math.floor(new Date(result.cooldownUntil).getTime() / 1000);
    return `5 karakter çekme hakkını kullandın. Yeni hakların <t:${unix}:R> hazır olacak.`;
  }
  return '5 karakter çekme hakkını kullandın. Yeni hakların **30 dakika** sonra yenilenecek.';
}

async function drawForUser(guildId, userId, previousName = null) {
  await ensureUser(guildId, userId);
  const result = await pool.query(
    'SELECT pity_count FROM users WHERE guild_id = $1 AND user_id = $2',
    [guildId, userId]
  );
  const pityCount = Number(result.rows[0]?.pity_count ?? 0);
  return drawCharacter(previousName, pityCount >= 19);
}

async function saveCharacter(guildId, userId, character) {
  await ensureUser(guildId, userId);
  const result = await pool.query(
    `INSERT INTO anime_character_collection
      (guild_id, user_id, character_name, anime, rarity, emoji, color, description, traits, image)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (guild_id, user_id, character_name)
     DO UPDATE SET quantity = anime_character_collection.quantity + 1,
                   anime = EXCLUDED.anime,
                   rarity = EXCLUDED.rarity,
                   emoji = EXCLUDED.emoji,
                   color = EXCLUDED.color,
                   description = EXCLUDED.description,
                   traits = EXCLUDED.traits,
                   image = EXCLUDED.image,
                   last_obtained_at = NOW()
     RETURNING quantity`,
    [guildId, userId, character.name, character.anime, character.rarity, character.emoji, character.color, character.description, character.traits, character.image]
  );
  await pool.query(
    `UPDATE users SET pity_count = CASE WHEN $3 = 'Efsanevi' THEN 0 ELSE pity_count + 1 END
     WHERE guild_id = $1 AND user_id = $2`,
    [guildId, userId, character.rarity]
  );
  return result.rows[0].quantity;
}

function createCharacterEmbed(character, user, quantity) {
  const info = rarityInfo[character.rarity] ?? rarityInfo.Nadir;
  const eliteNames = ['Goku', 'Naruto Uzumaki', 'Monkey D. Luffy', 'Levi Ackerman', 'Satoru Gojo'];
  const elite = eliteNames.includes(character.name);
  const rarityFrame = {
    Yaygın: '┌ · · · · · · · · · · ┐',
    Nadir: '┌ ◆ ───────────── ◆ ┐',
    Destansı: '┌ ✦ ═══════════ ✦ ┐',
    Efsanevi: '╔ ✧ ═══════════ ✧ ╗'
  }[character.rarity] ?? '┌ · · · · · · · · · · ┐';
  const discoveryLine = {
    Yaygın: 'Yeni bir yol arkadaşı buldun.',
    Nadir: 'Güzel bir keşif yaptın!',
    Destansı: 'Şanslısın, güçlü bir karakter keşfettin!',
    Efsanevi: '🌟 Efsanevi bir keşif! Bu karakter koleksiyonuna değer katacak.'
  }[character.rarity] ?? 'Yeni bir karakter keşfettin!';
  const embed = new EmbedBuilder()
    .setColor(character.color)
    .setAuthor({
      name: `✧ ${character.rarity.toLocaleUpperCase('tr-TR')} ✧`
    })
    .setTitle(`${character.emoji}  ${character.name}  ${character.emoji}`)
    .setDescription(
      `${rarityFrame}\n**${user.username}**, ${discoveryLine}\n\n${character.description}\n\n${rarityFrame}`
    )
    .addFields(
      { name: '🎬  ANİME', value: `**${character.anime}**`, inline: true },
      { name: `${character.emoji}  SINIF`, value: `**${character.rarity}**\n${info.stars}`, inline: true },
      { name: '📚  KOLEKSİYON', value: `**×${quantity}**`, inline: true },
      { name: '✧  KARAKTER ÖZELLİKLERİ', value: `┏  ${character.traits}\n┗━━━━━━━━━━━━━━━━`, inline: false }
    )
    .setFooter({ text: 'Poğaça Frieren • Karakter Keşfi' })
    .setTimestamp();
  if (character.image) embed.setImage(character.image);
  return embed;
}
function createRow(disabled = false) {
  const button = new ButtonBuilder()
    .setCustomId('kimimben_again')
    .setLabel(disabled ? 'Süre doldu' : 'Yeni karakter keşfet')
    .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
    .setDisabled(disabled);
  if (!disabled) button.setEmoji('🎲');
  return new ActionRowBuilder().addComponents(button);
}

export default {
  data: new SlashCommandBuilder()
    .setName('kimimben')
    .setDescription('Rastgele bir anime karakteri keşfet ve koleksiyonuna ekle.'),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Bu komut yalnızca sunucularda kullanılabilir.', ephemeral: true });
    }
    await interaction.deferReply();
    await ensureUser(interaction.guildId, interaction.user.id);
    const drawClaim = await claimDrawCooldown(interaction.guildId, interaction.user.id);
    if (!drawClaim.ok) return interaction.editReply(cooldownMessage(drawClaim));

    let character = await drawForUser(interaction.guildId, interaction.user.id);
    let quantity;
    try {
      quantity = await saveCharacter(interaction.guildId, interaction.user.id, character);
    } catch (error) {
      console.error('Karakter kaydetme hatası:', error);
      return interaction.editReply('Karakter veritabanına kaydedilemedi. Lütfen biraz sonra tekrar dene.');
    }

    const response = await interaction.editReply({
      embeds: [createCharacterEmbed(character, interaction.user, quantity)],
      components: [createRow()]
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: BUTTON_TIMEOUT
    });

    collector.on('collect', async button => {
      if (button.customId !== 'kimimben_again') {
        return button.deferUpdate().catch(() => {});
      }
      if (button.user.id !== interaction.user.id) {
        return button.reply({
          content: 'Bu karakteri yalnızca komutu kullanan kişi yenileyebilir.',
          ephemeral: true
        }).catch(() => {});
      }

      try {
        const drawClaim = await claimDrawCooldown(interaction.guildId, interaction.user.id);
        if (!drawClaim.ok) {
          return button.reply({ content: cooldownMessage(drawClaim), ephemeral: true }).catch(() => {});
        }
        const nextCharacter = await drawForUser(interaction.guildId, interaction.user.id, character.name);
        const nextQuantity = await saveCharacter(interaction.guildId, interaction.user.id, nextCharacter);
        await button.update({
          embeds: [createCharacterEmbed(nextCharacter, interaction.user, nextQuantity)],
          components: [createRow()]
        });
        character = nextCharacter;
      } catch (error) {
        console.error('Kimimben buton/kayıt hatası:', error);
        if (!button.replied && !button.deferred) {
          await button.reply({
            content: 'Karakter kaydedilirken bir hata oluştu. Tekrar deneyebilirsin.',
            ephemeral: true
          }).catch(() => {});
        }
      }
    });

    collector.on('end', async () => {
      try {
        await interaction.editReply({ components: [createRow(true)] });
      } catch (error) {
        console.error('Kimimben butonu kapatılamadı:', error);
      }
    });
  }
};
