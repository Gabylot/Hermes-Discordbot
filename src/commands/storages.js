import { SlashCommandBuilder } from 'discord.js';
import { getAllStorages } from '../utils/api.js';
import { buildStoragesEmbeds } from '../embeds/index.js';

export default {
  data: new SlashCommandBuilder()
    .setName('storages')
    .setDescription('Lists all storages with their city, hex and code'),
  async execute(interaction) {
    // Defer so the backend request has time to complete
    await interaction.deferReply();

    let storages;
    try {
      storages = await getAllStorages();
    } catch (err) {
      console.error('[storages] failed to fetch storages:', err.message);
      await interaction.editReply('❌ Could not fetch storages from the backend.');
      return;
    }

    const embeds = buildStoragesEmbeds(storages);
    await interaction.editReply({ embeds });
  },
};
