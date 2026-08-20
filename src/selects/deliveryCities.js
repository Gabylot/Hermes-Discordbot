import { MessageFlags } from 'discord.js';
import { deliverySessions, renderConfig } from '../utils/deliveryBuilder.js';

/**
 * Shared handler for the two city select menus (production + frontline).
 * Picks the city, clears any previously-entered container count (a city
 * change invalidates the old plan), and re-renders the action button.
 */
async function applyCity(interaction) {
  await interaction.deferUpdate();

  const session = deliverySessions.get(interaction.message.id);
  if (!session || session.userId !== interaction.user.id) {
    await interaction.followUp({
      content: '⚠️ Session expired or not yours. Run `/delivery` again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const value = interaction.values[0];
  if (interaction.customId === 'delivery_pick_production') {
    session.productionCityId = value;
  } else if (interaction.customId === 'delivery_pick_frontline') {
    session.frontlineCityId = value;
  }

  // A city change invalidates any previously-entered container count.
  if (session.containers) session.containers = null;

  // The config message is ephemeral — it can only be edited via the
  // interaction token (message.edit uses channel+ID lookup and 404s).
  await interaction.editReply({ components: renderConfig(session) });
}

export const deliveryProductionSelect = {
  customId: 'delivery_pick_production',
  execute: applyCity,
};

export const deliveryFrontlineSelect = {
  customId: 'delivery_pick_frontline',
  execute: applyCity,
};

// Default export is an array so the select loader picks up both.
export default [deliveryProductionSelect, deliveryFrontlineSelect];