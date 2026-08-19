import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';

export const TICKET_CATEGORIES = [
  { value: 'mpf',                 label: 'MPF',                   emoji: '🏭' },
  { value: 'factory',             label: 'Factory',               emoji: '🏗️' },
  { value: 'resources',           label: 'Resources',             emoji: '📦' },
  { value: 'vehicles_structures', label: 'Vehicles & Structures', emoji: '🚚' },
];

export default {
  data: new SlashCommandBuilder()
    .setName('tickets')
    .setDescription('Pick a category and claim an open ticket'),
  async execute(interaction) {
    await interaction.deferReply();

    const embed = new EmbedBuilder()
      .setTitle('🎫 Ticket Grab')
      .setDescription(
        'Choose a **category** to see the open tickets you can claim.\n' +
        'Once you pick, you\'ll get a list of tickets to choose from.',
      )
      .setColor(0x3498db)
      .setTimestamp();

    const select = new StringSelectMenuBuilder()
      .setCustomId('tickets_categories')
      .setPlaceholder('Choose a category…')
      .addOptions(
        TICKET_CATEGORIES.map(cat =>
          new StringSelectMenuOptionBuilder()
            .setLabel(cat.label)
            .setValue(cat.value)
            .setEmoji(cat.emoji),
        ),
      );

    await interaction.editReply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(select)],
    });
  },
};