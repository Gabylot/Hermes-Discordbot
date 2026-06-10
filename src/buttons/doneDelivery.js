import { completeDelivery } from '../utils/api.js';
import { syncLeaderboard } from '../utils/ticketPoster.js';

export default {
  customId: 'done_delivery',
  async execute(interaction) {
    await interaction.deferUpdate();

    const contractId = interaction.customId.split(':')[1];
    const userId = interaction.user.id;

    try {
      const result = await completeDelivery(contractId, userId);

      // Log to admin channel
      const adminChannel = interaction.client.channels.cache.get(process.env.CHANNEL_ADMIN_LOG);
      if (adminChannel) {
        await adminChannel.send(
          `🚛 Delivery #${contractId} completed by <@${userId}> at <t:${Math.floor(Date.now() / 1000)}:f>` +
          (result.score ? ` — **${result.score}** points` : '')
        );
      }

      // Sync the leaderboard
      try {
        await syncLeaderboard(interaction.client);
      } catch (err) {
        console.error('[leaderboard] sync after delivery failed:', err.message);
      }

      // Delete the delivery message
      await interaction.message.delete();

      // Delete the private thread
      if (interaction.channel.isThread()) {
        await interaction.channel.delete();
      }
    } catch (err) {
      await interaction.followUp({ content: '❌ Could not complete this delivery.', ephemeral: true });
    }
  },
};