import { completeTicket } from '../utils/api.js';

export default {
  customId: 'done_ticket',
  async execute(interaction) {
    await interaction.deferUpdate();

    const ticketId = interaction.customId.split(':')[1];
    const userId   = interaction.user.id;
    const client   = interaction.client;

    try {
      const result = await completeTicket(ticketId, userId);
      const points = Number(result?.points ?? 0);

      const adminChannel = client.channels.cache.get(process.env.CHANNEL_ADMIN_LOG);
      if (adminChannel) {
        await adminChannel.send(
          `✅ Ticket #${ticketId} completed by <@${userId}> at <t:${Math.floor(Date.now() / 1000)}:f>`
        );
      }

      // Announce the completion in the channel the ticket was claimed in
      // (the thread's parent) before the thread is removed.
      const parentChannel = interaction.channel.parent;
      if (parentChannel) {
        await parentChannel
          .send(`🏁 <@${userId}> finished **Ticket #${ticketId}** — +${points} Points!`)
          .catch(err => console.error('[done] could not send completion announcement:', err.message));
      }

      // Delete the thread (private threads are ephemeral, OK to remove)
      try {
        if (interaction.channel.type === 11 || interaction.channel.type === 12) {
          await interaction.channel.delete();
        }
      } catch {
        // Thread deletion failed — non-critical
      }

      console.log(`[done] ticket #${ticketId} completed by ${userId}`);
    } catch (err) {
      console.error(`[button] done_ticket error:`, err);
      await interaction.followUp({ content: '❌ Could not complete this ticket.', ephemeral: true });
    }
  },
};