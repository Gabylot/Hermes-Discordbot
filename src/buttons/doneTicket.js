import { completeTicket, promoteTicket, setTicketMessage } from '../utils/api.js';
import { buildProductionEmbed } from '../embeds/index.js';

const CHANNEL_TYPE_MAP = {
  [process.env.CHANNEL_MPF]:                 'mpf',
  [process.env.CHANNEL_FACTORY]:             'factory',
  [process.env.CHANNEL_RESOURCES]:           'resources',
  [process.env.CHANNEL_VEHICLES_STRUCTURES]: 'vehicles_structures',
};

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

      // Find the parent channel type — done button is inside a thread
      const parentChannel = interaction.channel.parent;
      const type = CHANNEL_TYPE_MAP[parentChannel?.id];

      if (type && parentChannel) {
        try {
          const next = await promoteTicket(type);

          // Look for an existing message for this ticket, or a "No tickets"
          // placeholder (Ticket #0) to reuse instead of posting a new message
          const parentMessages = await parentChannel.messages.fetch({ limit: 50 });
          let targetMsg = parentMessages.find(
            m => m.author.id === client.user.id &&
                 m.embeds.length > 0 &&
                 m.embeds[0]?.footer?.text === `Ticket #${next.ticket_id}`
          );
          if (!targetMsg) {
            // No message for this ticket — try to reuse a placeholder
            targetMsg = parentMessages.find(
              m => m.author.id === client.user.id &&
                   m.embeds.length > 0 &&
                   m.embeds[0]?.footer?.text === 'Ticket #0'
            );
          }
          if (targetMsg) {
            await targetMsg.edit(buildProductionEmbed(next));
            try {
              await setTicketMessage(next.ticket_id, targetMsg.id);
            } catch {
              // Non-critical
            }
          } else {
            const newMsg = await parentChannel.send(buildProductionEmbed(next));
            try {
              await setTicketMessage(next.ticket_id, newMsg.id);
            } catch {
              // Non-critical
            }
          }
        } catch (err) {
          // No queued ticket available — find the message and strip its buttons
          const messages = await parentChannel.messages.fetch({ limit: 50 });
          const original = messages.find(
            m => m.author.id === client.user.id &&
                 m.embeds.length > 0 &&
                 m.embeds[0]?.footer?.text?.startsWith('Ticket #')
          );
          if (original) {
            await original.edit({ components: [] });
          }
          console.log(`[done] no queued ticket available for ${type}`);
        }
      }

      // Announce the completion in the channel the ticket was claimed in
      // (the thread's parent) before the thread is removed.
      const parentChannelForAnnounce = interaction.channel.parent;
      if (parentChannelForAnnounce) {
        await parentChannelForAnnounce
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