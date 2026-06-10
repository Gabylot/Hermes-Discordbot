import { pendingDeliveries } from '../events/messageCreate.js';

export default {
  customId: 'delivery_request',
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // Check if this user already has a pending request
    for (const [, pending] of pendingDeliveries) {
      if (pending.userId === interaction.user.id) {
        await interaction.followUp({
          content: '⚠️ You already have a pending delivery request. Please finish it first.',
          ephemeral: true,
        });
        return;
      }
    }

    // Open a private thread in #delivery
    const thread = await interaction.channel.threads.create({
      name: `delivery-${interaction.user.username}`,
      autoArchiveDuration: 60,
      type: 12, // PRIVATE_THREAD
      invitable: false,
    });

    await thread.members.add(interaction.user.id);

    pendingDeliveries.set(thread.id, {
      userId: interaction.user.id,
      step: 'awaiting_count',
    });

    await thread.send(
      `Hey <@${interaction.user.id}>! How many **containers** can you deliver this run?\n` +
      `Just type the number (e.g. \`4\`).`
    );

    await interaction.followUp({
      content: `✅ I opened a private thread for you: ${thread}`,
      ephemeral: true,
    });
  },
};