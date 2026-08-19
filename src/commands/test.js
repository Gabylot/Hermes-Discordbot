import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('test')
    .setDescription('Replies with hello'),
  async execute(interaction) {
    await interaction.reply('hello');
  },
};