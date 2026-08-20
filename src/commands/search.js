import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { searchItems } from '../utils/api.js';
import { buildSearchEmbed } from '../embeds/index.js';

// In-memory sessions for the /search command.
// Keyed by the Discord message id of the select menu message.
// { userId, items }
export const searchSessions = new Map();

export default {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search for an item and see which storages hold it')
    .addStringOption(option =>
      option
        .setName('item')
        .setDescription('Item name or shortname to search for')
        .setRequired(true),
    ),
  async execute(interaction) {
    const term = interaction.options.getString('item', true);

    // Defer so the backend request has time to complete
    await interaction.deferReply();

    let result;
    try {
      result = await searchItems(term);
    } catch (err) {
      const status = err?.response?.status;
      const message = err?.response?.data?.message;

      if (status === 404 && message) {
        await interaction.editReply(`❌ ${message}`);
        return;
      }

      console.error('[search] failed to search items:', err.message);
      await interaction.editReply('❌ Could not search items on the backend.');
      return;
    }

    const items = result.items ?? [];

    // Single match — show it directly.
    if (items.length === 1) {
      const payload = buildSearchEmbed(items[0]);
      await interaction.editReply(payload);
      return;
    }

    // Multiple matches — let the user pick one.
    const select = new StringSelectMenuBuilder()
      .setCustomId('search_pick_item')
      .setPlaceholder('Select an item…')
      .setMinValues(1)
      .setMaxValues(1)
      .setOptions(
        items.slice(0, 25).map((item, i) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(item.name || `Item #${i + 1}`)
            .setDescription(item.shortname || undefined)
            .setValue(String(i)),
        ),
      );

    const row = new ActionRowBuilder().addComponents(select);

    const embed = new EmbedBuilder()
      .setTitle('🔍 Search Results')
      .setDescription(
        `Found **${items.length}** item${items.length !== 1 ? 's' : ''} matching \`${term}\`.\n` +
        'Pick one to see where it is stocked.',
      )
      .setColor(0x3498db)
      .setTimestamp();

    const msg = await interaction.editReply({
      embeds: [embed],
      components: [row],
    });

    searchSessions.set(msg.id, { userId: interaction.user.id, items });
  },
};