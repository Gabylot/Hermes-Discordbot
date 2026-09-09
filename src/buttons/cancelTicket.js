import { cancelTicket } from '../utils/api.js';
import { buildProductionEmbed } from '../embeds/index.js';

export default {
  customId: 'cancel_ticket',
  async execute(interaction) {
    await interaction.deferUpdate();

    const ticketId = interaction.customId.split(':')[1];
    const userId   = interaction.user.id;
    const client   = interaction.client;

    try {
      // Backend cancels the ticket and returns whichever ticket should now be
      // shown — may be the cancelled one or a promoted queued one.
      const shown = await cancelTicket(ticketId, userId);

      const adminChannel = client.channels.cache.get(process.env.CHANNEL_ADMIN_LOG);
      if (adminChannel) {
        await adminChannel.send(
          `🚫 Ticket #${ticketId} cancelled by <@${userId}> at <t:${Math.floor(Date.now() / 1000)}:f>`
        );
      }

      // The cancel button is in the thread — edit the thread message
      const embed = buildProductionEmbed(shown);
      await interaction.message.edit(embed);

      // Announce the cancellation in the channel the ticket was claimed in
      // (the thread's parent) before the thread is removed.
      const parentChannel = interaction.channel.parent;
      if (parentChannel) {
        await parentChannel
          .send(`❌ <@${userId}> canceled Ticket #${ticketId}`)
          .catch(err => console.error('[cancel] could not send cancellation announcement:', err.message));
      }

      // Delete the thread
      try {
        if (interaction.channel.type === 11 || interaction.channel.type === 12) {
          await interaction.channel.delete();
        }
      } catch {
        // Thread deletion failed — non-critical
      }

      console.log(`[cancel] ticket #${ticketId} cancelled, now showing #${shown.ticket_id}`);
    } catch (err) {
      console.error(`[button] cancel_ticket error:`, err);
      await interaction.followUp({ content: '❌ Could not cancel this ticket.', ephemeral: true });
    }
  },
};