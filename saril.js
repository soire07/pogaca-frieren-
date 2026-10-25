import { SlashCommandBuilder } from 'discord.js';
export default {
  data: new SlashCommandBuilder().setName('saril').setDescription('Bir kullanıcıya dostça anime temalı destek gönderir.')
    .addUserOption(o => o.setName('kullanici').setDescription('Destek göndereceğin kullanıcı').setRequired(true)),
  async execute(interaction) {
    const user = interaction.options.getUser('kullanici');
    await interaction.reply(`🌸 ${interaction.user} ➜ ${user}\nFern onaylı, dostça bir destek mesajı!`);
  }
};
