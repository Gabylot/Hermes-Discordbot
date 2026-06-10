import { cancelDelivery } from '../utils/api.js';

export default {
  customId: 'cancel_delivery',
  async execute(interaction) {
    await interaction.deferUpdate();

    const contractId = interaction.customId.split(':')[1];
    const userId = interaction.user.id;

    try {
      await cancelDelivery(contractId, userId);

      // Log to admin channel
      const adminChannel = interaction.client.channels.cache.get(process.env.CHANNEL_ADMIN_LOG);
      if (adminChannel) {
        await adminChannel.send(
          `❌ Delivery #${contractId} cancelled by <@${userId}> at <t:${Math.floor(Date.now() / 1000)}:f>`
        );
      }

      // Delete the delivery message
      await interaction.message.delete();

      // Delete the private thread
      if (interaction.channel.isThread()) {
        await interaction.channel.delete();
      }
    } catch (err) {
      await interaction.followUp({ content: '❌ Could not cancel this delivery.', ephemeral: true });
    }
  },
};