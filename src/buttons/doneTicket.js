import { completeTicket, regenerateTickets } from '../utils/api.js';
import { syncTickets, cleanChannel } from '../utils/ticketPoster.js';

const CHANNEL_TYPES = ['mpf', 'factory', 'resources', 'vehicles_structures'];

export default {
  customId: 'done_ticket',
  async execute(interaction) {
    await interaction.deferUpdate();

    const ticketId = interaction.customId.split(':')[1];
    const userId = interaction.user.id;
    const client = interaction.client;

    try {
      await completeTicket(ticketId, userId);

      // Log to admin channel
      const adminChannel = client.channels.cache.get(process.env.CHANNEL_ADMIN_LOG);
      if (adminChannel) {
        await adminChannel.send(
          `✅ Ticket #${ticketId} completed by <@${userId}> at <t:${Math.floor(Date.now() / 1000)}:f>`
        );
      }

      await interaction.message.delete();

      // Delete the thread if we're in one
      if (interaction.channel.type === 11 || interaction.channel.type === 12) {
        await interaction.channel.delete();
      }

      // Regenerate tickets to replace the completed one
      try {
        await regenerateTickets();
        console.log(`[done] tickets regenerated after completing ticket #${ticketId}`);
      } catch (err) {
        console.error(`[done] failed to regenerate tickets:`, err.message);
      }

      // Re-sync ticket channels so fresh tickets appear
      for (const type of CHANNEL_TYPES) {
        try {
          await cleanChannel(client, type);
          await syncTickets(client, type);
        } catch (err) {
          console.error(`[done] failed to re-sync ${type}:`, err.message);
        }
      }
    } catch (err) {
      await interaction.followUp({ content: '❌ Could not complete this ticket.', ephemeral: true });
    }
  },
};
