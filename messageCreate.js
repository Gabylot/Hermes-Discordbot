import { buildDeliveryTicketEmbed } from '../embeds/index.js';
import { buildDeliveryJob } from '../utils/api.js';

// Temporary in-memory store for pending delivery requests
// { threadId -> { userId, step: 'awaiting_count' | 'awaiting_structures', containerCount? } }
export const pendingDeliveries = new Map();

export default {
  name: 'messageCreate',
  once: false,
  async execute(message) {
    if (message.author.bot) return;
    if (!message.channel.isThread()) return;

    const pending = pendingDeliveries.get(message.channel.id);
    if (!pending) return;
    if (pending.userId !== message.author.id) return;

    if (pending.step === 'awaiting_count') {
      const count = parseInt(message.content.trim(), 10);

      if (isNaN(count) || count < 1) {
        await message.reply('Please enter a valid number of containers (e.g. `4`).');
        return;
      }

      pending.containerCount = count;
      pending.step = 'awaiting_structures';

      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`delivery_structures_yes:${message.channel.id}`)
          .setLabel('Yes, include them')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`delivery_structures_no:${message.channel.id}`)
          .setLabel('No, containers only')
          .setStyle(ButtonStyle.Secondary),
      );

      await message.reply({
        content: `Got it — **${count} containers**.\n\nDo you also want to deliver structures/vehicles?`,
        components: [row],
      });
    }
  },
};
