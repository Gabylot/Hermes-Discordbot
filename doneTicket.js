import { completeTicket } from '../../utils/api.js';

export default {
  customId: 'done_ticket',
  async execute(interaction) {
    await interaction.deferUpdate();

    const ticketId = interaction.customId.split(':')[1];
    const userId = interaction.user.id;

    try {
      await completeTicket(ticketId, userId);

      // Log to admin channel
      const adminChannel = interaction.client.channels.cache.get(process.env.CHANNEL_ADMIN_LOG);
      if (adminChannel) {
        await adminChannel.send(
          `✅ Ticket #${ticketId} completed by <@${userId}> at <t:${Math.floor(Date.now() / 1000)}:f>`
        );
      }

      await interaction.message.delete();
    } catch (err) {
      await interaction.followUp({ content: '❌ Could not complete this ticket.', ephemeral: true });
    }
  },
};
