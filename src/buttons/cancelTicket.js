import { cancelTicket, regenerateTickets } from '../utils/api.js';
import { syncTickets, cleanChannel } from '../utils/ticketPoster.js';

const CHANNEL_TYPES = ['mpf', 'factory', 'resources', 'vehicles_structures'];

export default {
  customId: 'cancel_ticket',
  async execute(interaction) {
    await interaction.deferUpdate();

    const ticketId = interaction.customId.split(':')[1];
    const userId = interaction.user.id;
    const client = interaction.client;

    try {
      await cancelTicket(ticketId, userId);

      // Log to admin channel
      const adminChannel = client.channels.cache.get(process.env.CHANNEL_ADMIN_LOG);
      if (adminChannel) {
        await adminChannel.send(
          `🚫 Ticket #${ticketId} cancelled by <@${userId}> at <t:${Math.floor(Date.now() / 1000)}:f>`
        );
      }

      // Delete the thread (it's no longer needed since the ticket went back to open)
      if (interaction.channel.type === 11 || interaction.channel.type === 12) { // public/private thread
        await interaction.channel.delete();
      }

      // Regenerate and re-sync tickets
      try {
        await regenerateTickets();
        console.log(`[cancel] tickets regenerated after cancelling ticket #${ticketId}`);
      } catch (err) {
        console.error(`[cancel] failed to regenerate tickets:`, err.message);
      }

      for (const type of CHANNEL_TYPES) {
        try {
          await cleanChannel(client, type);
          await syncTickets(client, type);
        } catch (err) {
          console.error(`[cancel] failed to re-sync ${type}:`, err.message);
        }
      }

      console.log(`[cancel] ticket #${ticketId} cancelled by ${userId}`);
    } catch (err) {
      console.error(`[button] cancel_ticket error:`, err);
      await interaction.followUp({ content: '❌ Could not cancel this ticket.', ephemeral: true });
    }
  },
};