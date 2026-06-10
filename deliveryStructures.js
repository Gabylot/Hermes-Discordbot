import { pendingDeliveries } from '../../events/messageCreate.js';
import { buildDeliveryJob } from '../../utils/api.js';
import { buildDeliveryTicketEmbed } from '../../embeds/index.js';

async function handleStructuresAnswer(interaction, includeStructures) {
  await interaction.deferUpdate();

  const threadId = interaction.customId.split(':')[1];
  const pending = pendingDeliveries.get(threadId);

  if (!pending || pending.userId !== interaction.user.id) {
    await interaction.followUp({ content: '❌ Could not find your delivery request.', ephemeral: true });
    return;
  }

  pendingDeliveries.delete(threadId);

  try {
    const job = await buildDeliveryJob(interaction.user.id, pending.containerCount, includeStructures);

    // Post the ticket in #delivery
    const deliveryChannel = interaction.client.channels.cache.get(process.env.CHANNEL_DELIVERY);
    await deliveryChannel.send(buildDeliveryTicketEmbed(job, interaction.user.id));

    await interaction.followUp({
      content: `✅ Your delivery job has been posted in <#${process.env.CHANNEL_DELIVERY}>!`,
    });

    // Close the thread
    await interaction.channel.setArchived(true);
  } catch (err) {
    console.error('[delivery] error building job:', err);
    await interaction.followUp({
      content: '❌ Could not build your delivery job. There may be nothing to deliver right now.',
    });
    await interaction.channel.setArchived(true);
  }
}

export const deliveryStructuresYes = {
  customId: 'delivery_structures_yes',
  execute: (interaction) => handleStructuresAnswer(interaction, true),
};

export const deliveryStructuresNo = {
  customId: 'delivery_structures_no',
  execute: (interaction) => handleStructuresAnswer(interaction, false),
};

// Default export for the loader (handles both prefixes)
export default deliveryStructuresYes;
