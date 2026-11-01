import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { levelForXp } from './utils.js';

const npcs = {
  frieren: {
    name: '🪄 Frieren',
    path: 'merak',
    pathLabel: 'Merak',
    questKey: 'frieren_relics',
    questTitle: 'Kayıp Büyü İzleri',
    dialogue: 'Hm… Eski büyü kalıntılarıyla ilgileniyorsun demek. Bazı izler harabelerin kuzeyinde hâlâ parlıyor. Acele etme; önce ne aradığını anlamalısın.',
    questDialogue: 'Üç eski büyü kalıntısının izini sür. Yeni büyüler öğrenmen, bu izleri tanımana yardım edecek.',
    objective: 'Zoltraak dışında en az 2 büyü öğren.',
    reward: { coins: 260, xp: 100 },
    requirement: async (client, guildId, userId) => {
      const result = await client.query(
        "SELECT COUNT(*)::int AS count FROM learned_spells WHERE guild_id=$1 AND user_id=$2 AND spell_key <> 'zoltraak'",
        [guildId, userId]
      );
      const count = Number(result.rows[0]?.count || 0);
      return { ok: count >= 2, progress: count + ' / 2 yeni büyü' };
    }
  },
  fern: {
    name: '🌿 Fern',
    path: 'merhamet',
    pathLabel: 'Merhamet',
    questKey: 'fern_supplies',
    questTitle: 'Yol Arkadaşına Yardım',
    dialogue: 'Yolculukta hazırlıklı olmak önemlidir. Kendine ve yol arkadaşlarına iyi bakmayı unutma; küçük bir yardım bile büyük fark yaratabilir.',
    questDialogue: 'Yolculuk için eşya kullanarak hazırlığını göster. Bir maceracı, ihtiyaç anında elindekileri doğru kullanmayı bilmelidir.',
    objective: 'En az 3 eşya kullan.',
    reward: { coins: 220, xp: 110 },
    requirement: async (client, guildId, userId, user) => {
      const count = Number(user.items_used_count);
      return { ok: count >= 3, progress: count + ' / 3 eşya kullanımı' };
    }
  },
  stark: {
    name: '⚔️ Stark',
    path: 'cesaret',
    pathLabel: 'Cesaret',
    questKey: 'stark_demon_hunt',
    questTitle: 'Kuzey Avı',
    dialogue: 'B-bir iblis mi? Elbette korkmuyorum! Yani… birlikte gidersek daha güvenli olur. Önce biraz güçlendiğinden emin ol.',
    questDialogue: 'Kuzeydeki iblisleri alt et. Korkmak normaldir; önemli olan gerektiğinde öne çıkabilmektir.',
    objective: 'Toplamda en az 2 iblis zaferi kazan.',
    reward: { coins: 280, xp: 120 },
    requirement: async (client, guildId, userId, user) => {
      const count = Number(user.boss_defeats);
      return { ok: count >= 2, progress: count + ' / 2 iblis zaferi' };
    }
  }
};

export default {
  data: new SlashCommandBuilder()
    .setName('npc')
    .setDescription('Frieren, Fern ve Stark ile konuş veya seçimlerine bağlı yan görev yap.')
    .addStringOption(option =>
      option.setName('karakter')
        .setDescription('Konuşmak istediğin karakter')
        .setRequired(true)
        .addChoices(
          { name: 'Frieren — Büyü ve keşif', value: 'frieren' },
          { name: 'Fern — Hazırlık ve yardım', value: 'fern' },
          { name: 'Stark — Cesaret ve savaş', value: 'stark' }
        )
    )
    .addStringOption(option =>
      option.setName('eylem')
        .setDescription('Karakterle ne yapmak istiyorsun?')
        .setRequired(true)
        .addChoices(
          { name: 'Konuş', value: 'konus' },
          { name: 'Yan görevi görüntüle', value: 'gorev' },
          { name: 'Görevi teslim et ve ödülü al', value: 'teslim' }
        )
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'NPC sistemi yalnızca sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const npcKey = interaction.options.getString('karakter');
    const action = interaction.options.getString('eylem');
    const npc = npcs[npcKey];

    try {
      await ensureUser(guildId, userId);
      const client = await pool.connect();
      let response;
      try {
        await client.query('BEGIN');
        const userResult = await client.query(
          'SELECT xp, level, coins, items_used_count, boss_defeats FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
          [guildId, userId]
        );
        const user = userResult.rows[0];
        const storyResult = await client.query(
          'SELECT choices FROM story_progress WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
          [guildId, userId]
        );
        const storyChoices = Array.isArray(storyResult.rows[0]?.choices) ? storyResult.rows[0].choices : [];
        const selectedPath = storyChoices[0];

        if (action === 'konus') {
          const line = selectedPath
            ? (selectedPath === npc.path ? npc.dialogue : 'Yolculuğunda ' + (selectedPath === 'cesaret' ? 'cesareti' : selectedPath === 'merhamet' ? 'merhameti' : 'merakı') + ' seçtin. ' + npc.dialogue)
            : 'Henüz ana hikâyede bir yol seçmedin. Önce /hikaye komutuyla ilk kararını ver. ' + npc.dialogue;
          await client.query('COMMIT');
          const embed = new EmbedBuilder()
            .setColor(0x9b8cff)
            .setTitle(npc.name + ' ile karşılaşma')
            .setDescription('> ' + line)
            .setFooter({ text: 'Karakterinle konuşmak, yolculuğunun bir parçası.' });
          return interaction.editReply({ embeds: [embed] });
        }

        if (!selectedPath) {
          await client.query('COMMIT');
          return interaction.editReply('📜 Önce /hikaye komutuyla ana hikâyeye başla ve ilk kararını ver. Yan görevler seçtiğin yola göre açılır.');
        }

        if (selectedPath !== npc.path) {
          await client.query('COMMIT');
          const selectedName = selectedPath === 'cesaret' ? 'Stark' : selectedPath === 'merhamet' ? 'Fern' : 'Frieren';
          return interaction.editReply('🔒 Senin seçtiğin **' + (selectedPath === 'cesaret' ? 'Cesaret' : selectedPath === 'merhamet' ? 'Merhamet' : 'Merak') + '** yolu için görev veren karakter **' + selectedName + '**. Onunla /npc karakter:' + selectedName.toLowerCase() + ' eylem:gorev komutunu kullan.');
        }

        const claimedResult = await client.query(
          'SELECT 1 FROM side_quest_claims WHERE guild_id=$1 AND user_id=$2 AND quest_key=$3',
          [guildId, userId, npc.questKey]
        );
        if (claimedResult.rowCount) {
          await client.query('COMMIT');
          return interaction.editReply('✅ **' + npc.questTitle + '** görevini zaten tamamladın ve ödülünü aldın. Yeni yan görevler sonraki güncellemelerde eklenecek.');
        }

        const requirement = await npc.requirement(client, guildId, userId, user);
        if (action === 'gorev') {
          await client.query('COMMIT');
          const embed = new EmbedBuilder()
            .setColor(0x9b8cff)
            .setTitle(npc.name + ' · ' + npc.questTitle)
            .setDescription(npc.questDialogue)
            .addFields(
              { name: '🎯 Görev', value: npc.objective, inline: false },
              { name: '📊 İlerleme', value: requirement.progress, inline: true },
              { name: '🎁 Ödül', value: npc.reward.coins + ' altın · ' + npc.reward.xp + ' XP', inline: true }
            )
            .setFooter({ text: requirement.ok ? 'Görev hazır! Eylem olarak “Görevi teslim et” seç.' : 'İlerlemeni tamamla, sonra görevi teslim et.' });
          return interaction.editReply({ embeds: [embed] });
        }

        if (!requirement.ok) {
          await client.query('COMMIT');
          return interaction.editReply('🧭 **' + npc.questTitle + '** henüz tamamlanmadı.\n' + npc.objective + '\nİlerleme: **' + requirement.progress + '**');
        }

        const newXp = Number(user.xp) + npc.reward.xp;
        const newLevel = levelForXp(newXp);
        const gainedPoints = Math.max(0, newLevel - Number(user.level));
        await client.query(
          'UPDATE users SET coins=coins+$3, xp=$4, level=$5, stat_points=stat_points+$6 WHERE guild_id=$1 AND user_id=$2',
          [guildId, userId, npc.reward.coins, newXp, newLevel, gainedPoints]
        );
        await client.query(
          'INSERT INTO side_quest_claims(guild_id,user_id,quest_key) VALUES($1,$2,$3)',
          [guildId, userId, npc.questKey]
        );
        await client.query('COMMIT');
        response = '🎉 **' + npc.questTitle + '** tamamlandı!\n' + npc.name + ' sana teşekkür ediyor.\nÖdül: **' + npc.reward.coins + ' altın** ve **' + npc.reward.xp + ' XP**' +
          (gainedPoints ? '\n✨ Seviye atladın: +' + gainedPoints + ' stat puanı.' : '') +
          '\nBu görevin ödülü her oyuncu için bir kez alınabilir.';
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
      return interaction.editReply(response);
    } catch (error) {
      console.error('/npc hatası:', error);
      return interaction.editReply('NPC etkileşimi kaydedilemedi. Biraz sonra tekrar dene.');
    }
  }
};
