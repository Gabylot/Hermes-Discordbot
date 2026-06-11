import { cancelTicket } from '../utils/api.js';
import { buildProductionEmbed } from '../embeds/index.js';

export default {
  customId: 'cancel_ticket',
  async execute(interaction) {
    await interaction.deferUpdate();

    const ticketId = interaction.customId.split(':')[1];
    const userId   = interaction.user.id;
    const client   = interaction.client;

    try {
      // Backend re-evaluates priority and returns whichever ticket
      // should now be shown — may be the cancelled one or a promoted queued one
      const shown = await cancelTicket(ticketId, userId);

      const adminChannel = client.channels.cache.get(process.env.CHANNEL_ADMIN_LOG);
      if (adminChannel) {
        await adminChannel.send(
          `🚫 Ticket #${ticketId} cancelled by <@${userId}> at <t:${Math.floor(Date.now() / 1000)}:f>`
        );
      }

      const embed = buildProductionEmbed(shown);

      // The cancel button is in the thread — edit the thread message
      await interaction.message.edit(embed);

      // Also update the parent channel so the cancelled ticket gets its
      // claim button back. Find the specific message by ticket ID in the
      // embed footer ("Ticket #123"), or post a new one if not found.
      const parentChannel = interaction.channel.parent;
      if (parentChannel) {
        try {
          const messages = await parentChannel.messages.fetch({ limit: 50 });
          const original = messages.find(
            m => m.author.id === client.user.id &&
                 m.embeds.length > 0 &&
                 m.embeds[0]?.footer?.text === `Ticket #${ticketId}`
          );
          if (original) {
            await original.edit(embed);
            console.log(`[cancel] updated parent message for ticket #${ticketId}`);
          } else {
            // Message for this ticket not found — try to reuse a placeholder
            const placeholder = messages.find(
              m => m.author.id === client.user.id &&
                   m.embeds.length > 0 &&
                   m.embeds[0]?.footer?.text === 'Ticket #0'
            );
            if (placeholder) {
              await placeholder.edit(embed);
              console.log(`[cancel] reused placeholder for ticket #${shown.ticket_id}`);
            } else {
              // No placeholder either — post a new one
              await parentChannel.send(embed);
              console.log(`[cancel] posted new message for ticket #${shown.ticket_id} in parent channel`);
            }
          }
        } catch (err) {
          console.error(`[cancel] failed to update parent channel message:`, err.message);
        }
      }

      // Delete the thread
      try {
        if (interaction.channel.type === 11 || interaction.channel.type === 12) {
          await interaction.channel.delete();
        }
      } catch {
        // Thread deletion failed — non-critical
      }

      console.log(`[cancel] ticket #${ticketId} cancelled, now showing #${shown.ticket_id}`);
    } catch (err) {
      console.error(`[button] cancel_ticket error:`, err);
      await interaction.followUp({ content: '❌ Could not cancel this ticket.', ephemeral: true });
    }
  },
};