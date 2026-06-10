import { claimTicket } from '../../utils/api.js';
import { buildProductionEmbed } from '../../embeds/index.js';

export default {
  customId: 'claim_ticket',
  async execute(interaction) {
    await interaction.deferUpdate();

    const ticketId = interaction.customId.split(':')[1];
    const userId = interaction.user.id;

    try {
      const ticket = await claimTicket(ticketId, userId);
      await interaction.message.edit(buildProductionEmbed(ticket));
    } catch (err) {
      await interaction.followUp({ content: '❌ Could not claim this ticket.', ephemeral: true });
    }
  },
};
