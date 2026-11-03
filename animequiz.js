
import {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder
} from 'discord.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, ensureUser } from './database/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const questions = [
  {
    question: 'Frieren hangi ırka mensuptur?',
    answers: ['elf'],
    answer: 'Elf',
    anime: 'Frieren'
  },
  {
    question: 'Frieren’ın genç büyücü yol arkadaşı kimdir?',
    answers: ['fern'],
    answer: 'Fern',
    anime: 'Frieren'
  },
  {
    question: 'Stark hangi rolde savaşır?',
    answers: ['savaşçı', 'savasci'],
    answer: 'Savaşçı',
    anime: 'Frieren'
  },
  {
    question: 'Frieren’ın eski kahraman grubunun lideri kimdir?',
    answers: ['himmel'],
    answer: 'Himmel',
    anime: 'Frieren'
  },
  {
    question: 'One Piece’in ana karakteri kimdir?',
    answers: ['luffy', 'monkey d luffy'],
    answer: 'Monkey D. Luffy',
    anime: 'One Piece'
  },
  {
    question: 'Dragon Ball serisinin ana karakteri kimdir?',
    answers: ['goku', 'son goku'],
    answer: 'Son Goku',
    anime: 'Dragon Ball'
  },
  {
    question: 'Naruto’nun içinde hangi kuyruklu canavar bulunur?',
    answers: ['kurama', 'dokuz kuyruklu tilki'],
    answer: 'Kurama',
    anime: 'Naruto'
  },
  {
    question: 'Jujutsu Kaisen’de Gojo’nun adı nedir?',
    answers: ['satoru', 'satoru gojo', 'gojo'],
    answer: 'Satoru Gojo',
    anime: 'Jujutsu Kaisen'
  },
  {
    question: 'Death Note’u bulan karakter kimdir?',
    answers: ['light', 'light yagami', 'yagami light'],
    answer: 'Light Yagami',
    anime: 'Death Note'
  },
  {
    question: 'Attack on Titan’da ana karakterlerden biri olan Jaeger’ın adı nedir?',
    answers: ['eren', 'eren jaeger', 'eren yeager'],
    answer: 'Eren Yeager',
    anime: 'Attack on Titan'
  }
];

function normalize(text) {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

export async function awardAnimeQuizPoints(db, guildId, userId, points = 10) {
  if (!db || typeof db.query !== 'function') throw new Error('ANIME_QUIZ_DATABASE_REQUIRED');
  if (!/^\d{17,20}$/.test(String(guildId || '')) || !/^\d{17,20}$/.test(String(userId || ''))) {
    throw new Error('ANIME_QUIZ_PLAYER_REQUIRED');
  }
  const amount = Number(points);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100) throw new Error('ANIME_QUIZ_POINTS_INVALID');
  const result = await db.query(
    `INSERT INTO anime_quiz_scores (guild_id,user_id,points,correct_answers)
     VALUES ($1,$2,$3,1)
     ON CONFLICT (guild_id,user_id) DO UPDATE
       SET points=anime_quiz_scores.points+EXCLUDED.points,
           correct_answers=anime_quiz_scores.correct_answers+1,
           updated_at=NOW()
     RETURNING points,correct_answers`,
    [String(guildId), String(userId), amount]
  );
  const row = result.rows?.[0];
  if (!row) throw new Error('ANIME_QUIZ_SCORE_NOT_SAVED');
  return { points: Number(row.points), correctAnswers: Number(row.correct_answers) };
}

function makeEmbed(title, description, color, gifName) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setImage(`attachment://${gifName}`)
    .setFooter({
      text: 'Poğaça Frieren • Anime Quiz'
    });
}

export default {
  data: new SlashCommandBuilder()
    .setName('animequiz')
    .setDescription('Süreli anime bilgi yarışmasına katıl.'),

  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Anime Quiz yalnızca sunucularda oynanabilir.', ephemeral: true });
    const question =
      questions[Math.floor(Math.random() * questions.length)];

    const startGif = 'animequiz.gif';
    const gif = new AttachmentBuilder(join(__dirname, startGif));

    const embed = makeEmbed(
      '🪄 Anime Quiz Başladı!',
      `**${question.question}**\n\n` +
      `🎬 Anime: **${question.anime}**\n` +
      '⏳ Cevaplamak için **20 saniyen** var.\n' +
      '🏆 Doğru cevap: **10 puan**\n\n' +
      'Cevabını bu kanala mesaj olarak yaz!',
      0x9b8cff,
      startGif
    );

    await interaction.reply({
      embeds: [embed],
      files: [gif]
    });

    if (!interaction.channel?.isTextBased()) return;

    let answered = false;

    const collector = interaction.channel.createMessageCollector({
      time: 20_000,
      filter: message => !message.author.bot
    });

    collector.on('collect', async message => {
      if (answered) return;

      const submitted = normalize(message.content);
      const isCorrect = question.answers.some(
        answer => normalize(answer) === submitted
      );

      if (!isCorrect) return;

      answered = true;
      collector.stop('answered');

      let score;
      try {
        await ensureUser(interaction.guildId, message.author.id);
        score = await awardAnimeQuizPoints(pool, interaction.guildId, message.author.id, 10);
      } catch (error) {
        console.error('Anime quiz puanı kaydedilemedi:', error);
        await interaction.followUp({ content: 'Cevabın doğru; ancak puan veritabanına kaydedilemedi. Bu tur için tekrar puan yazılmadı.' }).catch(() => {});
        return;
      }

      try {
        const successGif = 'quizdogru.gif';
        const successAttachment = new AttachmentBuilder(
          join(__dirname, successGif)
        );

        const result = makeEmbed(
          '✅ Doğru Cevap!',
          `Tebrikler ${message.author}!\n\n` +
          `Doğru cevap: **${question.answer}**\n` +
          `✨ **10 puan** kazandın! Toplam anime quiz puanın: **${score.points}** · Doğru cevap: **${score.correctAnswers}**`,
          0x57f287,
          successGif
        );

        await interaction.followUp({
          embeds: [result],
          files: [successAttachment]
        });
      } catch (error) {
        console.error('Anime quiz doğru cevap hatası:', error);
      }
    });

    collector.on('end', async (_, reason) => {
      if (reason === 'answered' || answered) return;

      try {
        const failGif = 'quizyanlis.gif';
        const failAttachment = new AttachmentBuilder(
          join(__dirname, failGif)
        );

        const result = makeEmbed(
          '⏰ Süre Doldu!',
          `Bu turun süresi bitti!\n\n` +
          `Doğru cevap: **${question.answer}**\n` +
          'Bir sonraki turda tekrar deneyebilirsin.',
          0xe06c75,
          failGif
        );

        await interaction.followUp({
          embeds: [result],
          files: [failAttachment]
        });
      } catch (error) {
        console.error('Anime quiz süre sonu hatası:', error);
      }
    });
  }
};
