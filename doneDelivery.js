import { completeDelivery } from '../../utils/api.js';

export default {
  customId: 'done_delivery',
  async execute(interaction) {
    await interaction.deferUpdate();

    const deliveryId = interaction.customId.split(':')[1];
    const userId = interaction.user.id;

    try {
      await completeDelivery(deliveryId, userId);

      const adminChannel = interaction.client.channels.cache.get(process.env.CHANNEL_ADMIN_LOG);
      if (adminChannel) {
        await adminChannel.send(
          `🚛 Delivery #${deliveryId} completed by <@${userId}> at <t:${Math.floor(Date.now() / 1000)}:f>`
        );
      }

      await interaction.message.delete();
    } catch (err) {
      await interaction.followUp({ content: '❌ Could not complete this delivery.', ephemeral: true });
    }
  },
};
