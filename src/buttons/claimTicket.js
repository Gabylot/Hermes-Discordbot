import { getClaimTicket, regenerateTickets } from '../utils/api.js';
import { buildProductionEmbed } from '../embeds/index.js';
import { syncTickets, cleanChannel } from '../utils/ticketPoster.js';

const CHANNEL_TYPES = ['mpf', 'factory', 'resources', 'vehicles_structures'];

export default {
  customId: 'claim_ticket',
  async execute(interaction) {
    await interaction.deferUpdate();

    const ticketId = interaction.customId.split(':')[1];
    const userId = interaction.user.id;
    const client = interaction.client;

    try {
      const ticket = await getClaimTicket(ticketId, userId);

      // Delete the original message from the ticket channel
      await interaction.message.delete();

      // Log to admin channel
      const adminChannel = client.channels.cache.get(process.env.CHANNEL_ADMIN_LOG);
      if (adminChannel) {
        await adminChannel.send(
          `🎫 Ticket #${ticketId} claimed by <@${userId}> at <t:${Math.floor(Date.now() / 1000)}:f>`
        );
      }

      // Open a private thread for the claimed ticket
      const channel = interaction.channel;
      const thread = await channel.threads.create({
        name: `Ticket #${ticketId} — ${ticket.title || 'Claimed'}`,
        autoArchiveDuration: 1440, // 24 hours
        reason: `Claimed by <@${userId}>`,
      });
      await thread.members.add(userId);

      // Post the claimed ticket embed in the thread (with Done button)
      const payload = buildProductionEmbed(ticket);
      await thread.send(payload);

      console.log(`[claim] ticket #${ticketId} claimed by ${userId}, thread created: ${thread.id}`);

      // Regenerate tickets to replace the claimed one
      try {
        await regenerateTickets();
        console.log(`[claim] tickets regenerated after claim #${ticketId}`);
      } catch (err) {
        console.error(`[claim] failed to regenerate tickets:`, err.message);
      }

      // Clean and re-sync all ticket channels
      for (const type of CHANNEL_TYPES) {
        try {
          await cleanChannel(client, type);
          await syncTickets(client, type);
        } catch (err) {
          console.error(`[claim] failed to re-sync ${type}:`, err.message);
        }
      }
    } catch (err) {
      console.error(`[button] claim_ticket error:`, err);
      await interaction.followUp({ content: '❌ Could not claim this ticket.', ephemeral: true });
    }
  },
};