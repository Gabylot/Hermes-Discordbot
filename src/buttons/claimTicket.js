import { getClaimTicket, promoteTicket, setTicketMessage } from '../utils/api.js';
import { buildProductionEmbed } from '../embeds/index.js';

export default {
  customId: 'claim_ticket',
  async execute(interaction) {
    await interaction.deferUpdate();

    const ticketId = interaction.customId.split(':')[1];
    const userId   = interaction.user.id;
    const client   = interaction.client;

    const CHANNEL_TYPE_MAP = {
      [process.env.CHANNEL_MPF]:                 'mpf',
      [process.env.CHANNEL_FACTORY]:             'factory',
      [process.env.CHANNEL_RESOURCES]:           'resources',
      [process.env.CHANNEL_VEHICLES_STRUCTURES]: 'vehicles_structures',
    };

    try {
      const ticket = await getClaimTicket(ticketId, userId);

      const adminChannel = client.channels.cache.get(process.env.CHANNEL_ADMIN_LOG);
      if (adminChannel) {
        await adminChannel.send(
          `🎫 Ticket #${ticketId} claimed by <@${userId}> at <t:${Math.floor(Date.now() / 1000)}:f>`
        );
      }

      // Open private thread for the claimer
      const thread = await interaction.channel.threads.create({
        name: `Ticket #${ticketId} — ${ticket.title || 'Claimed'}`,
        autoArchiveDuration: 1440,
        reason: `Claimed by ${userId}`,
      });
      await thread.members.add(userId);
      await thread.send(buildProductionEmbed(ticket));
      await thread.send(
        '💡 If you cannot produce one item, you should still produce the others. ' +
        'Mark the ticket as done after you picked up the items and delivered them to a stockpile.',
      );

      // Delete the system notification message Discord auto-creates
      // when a thread is started from a message — it's noisy and unnecessary.
      // System messages are type 21 (ThreadCreated) or have system === true.
      try {
        const recentMessages = await interaction.channel.messages.fetch({ limit: 10 });
        const systemMsg = recentMessages.find(
          m => m.system || m.type === 21 || m.type === 18 || m.type === 19 || m.type === 20
        );
        if (systemMsg) {
          await systemMsg.delete();
        }
      } catch {
        // Non-critical — system message deletion may fail with permissions
      }

      // Promote the next queued ticket and edit this message with it
      const type = CHANNEL_TYPE_MAP[interaction.channelId];
      if (type) {
        try {
          const next = await promoteTicket(type);
          await interaction.message.edit(buildProductionEmbed(next));
          // Save the message ID for the promoted ticket
          try {
            await setTicketMessage(next.ticket_id, interaction.message.id);
          } catch {
            // Non-critical
          }
          console.log(`[claim] promoted ticket #${next.ticket_id} into message`);
        } catch (err) {
          // No queued ticket available — show a "no tickets" message instead of
          // leaving stale buttons on an empty embed
          const noTicketsEmbed = buildProductionEmbed({
            ticket_id: 0,
            title: '📭 No Tickets Available',
            description: 'All tickets have been claimed. New tickets will appear when generated.',
            status: 'open',
            ticket_type: type,
            has_cost: false,
            items: [],
          });
          await interaction.message.edit({ ...noTicketsEmbed, components: [] });
          console.log(`[claim] no queued ticket available for ${type}`);
        }
      }

      console.log(`[claim] ticket #${ticketId} claimed by ${userId}, thread: ${thread.id}`);
    } catch (err) {
      console.error(`[button] claim_ticket error:`, err);
      await interaction.followUp({ content: '❌ Could not claim this ticket.', ephemeral: true });
    }
  },
};