import { pendingDeliveries } from '../events/messageCreate.js';
import { buildDeliveryJob, getCities } from '../utils/api.js';
import { buildDeliveryTicketEmbed } from '../embeds/index.js';

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
    // For now, use the first available production→frontline pair.
    // TODO: let the player pick cities via dropdown or buttons.
    const cities = await getCities();
    const productionCity = cities.find(c => c.isProduction);
    const frontlineCity = cities.find(c => c.isFront);

    if (!productionCity || !frontlineCity) {
      await interaction.followUp({
        content: '❌ No available production or frontline cities found.',
      });
      await interaction.channel.setArchived(true);
      return;
    }

    const job = await buildDeliveryJob(
      interaction.user.id,
      productionCity.id,
      frontlineCity.id,
      pending.containerCount,
      includeStructures,
    );

    // Post the delivery ticket in the private thread
    await interaction.channel.send(buildDeliveryTicketEmbed(job, interaction.user.id));

    await interaction.followUp({
      content: `✅ Your delivery job has been created! Check the thread above for details.`,
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

// Default export is an array so the button loader picks up both
export default [deliveryStructuresYes, deliveryStructuresNo];