import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} from 'discord.js';
import { getOpenTickets, getClaimTicket } from '../utils/api.js';
import { buildProductionEmbed } from '../embeds/index.js';
import { TICKET_CATEGORIES } from '../commands/tickets.js';

const CATEGORY_META = Object.fromEntries(TICKET_CATEGORIES.map(c => [c.value, c]));

function truncate(text, max) {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// ── Step 1: category chosen → list the open tickets for it ───────────────────

const categoriesSelect = {
  customId: 'tickets_categories',
  async execute(interaction) {
    await interaction.deferUpdate();

    const type = interaction.values[0];
    const meta = CATEGORY_META[type] || { label: type, emoji: '🎫' };

    let tickets = [];
    try {
      tickets = await getOpenTickets(type);
    } catch (err) {
      console.error('[tickets] failed to fetch open tickets:', err.message);
      await interaction.editReply({
        content: '❌ Could not fetch tickets from the backend.',
        embeds: [],
        components: [],
      });
      return;
    }

    if (!Array.isArray(tickets)) tickets = [];

    if (tickets.length === 0) {
      const empty = new EmbedBuilder()
        .setTitle(`${meta.emoji} No Open ${meta.label} Tickets`)
        .setDescription(
          'There are no open tickets in this category right now. ' +
          'Try another category, or check back later.',
        )
        .setColor(0x95a5a6);
      await interaction.editReply({ embeds: [empty], components: [] });
      return;
    }

    // Discord caps a message at 10 embeds — show each ticket's contents
    // (via buildProductionEmbed) for the first MAX_EMBEDS tickets.
    const MAX_EMBEDS = 10;
    const shownTickets = tickets.slice(0, MAX_EMBEDS);
    const ticketEmbeds = shownTickets.map(t => buildProductionEmbed(t).embeds[0]);

    let content =
      `${meta.emoji} **${tickets.length} open ${meta.label} ticket(s)** — details below, pick one to claim:`;
    if (tickets.length > MAX_EMBEDS) {
      content +=
        `\n\n*(Showing the first ${MAX_EMBEDS} — you can still pick any ticket from the menu.)*`;
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId(`tickets_claim:${type}`)
      .setPlaceholder('Choose a ticket to claim…')
      .addOptions(
        tickets.map(t => {
          const title = t.title || `Ticket #${t.ticket_id}`;
          return new StringSelectMenuOptionBuilder()
            .setLabel(`Ticket #${t.ticket_id} — ${truncate(title, 60)}`)
            .setValue(String(t.ticket_id))
            .setEmoji(meta.emoji);
        }),
      );

    await interaction.editReply({
      content,
      embeds: ticketEmbeds,
      components: [new ActionRowBuilder().addComponents(select)],
    });
  },
};

// ── Step 2: user picks a ticket → claim it and open a thread ─────────────────

const claimSelect = {
  customId: 'tickets_claim',
  async execute(interaction) {
    await interaction.deferUpdate();

    const type = interaction.customId.split(':')[1] || null;
    const ticketId = interaction.values[0];
    const userId = interaction.user.id;

    let ticket;
    try {
      ticket = await getClaimTicket(ticketId, userId);
    } catch (err) {
      const wasClaimed = err.response?.status === 409;
      await interaction.editReply({
        content: wasClaimed
          ? '❌ That ticket was just claimed by someone else. Run `/tickets` again to pick another.'
          : '❌ Could not claim that ticket.',
        embeds: [],
        components: [],
      });
      return;
    }

    // Update the ephemeral picker message with the claim confirmation so the
    // channel itself stays clean — the ticket details live in the thread.
    const payload = buildProductionEmbed(ticket);
    await interaction.editReply({
      content: `✅ **Ticket #${ticket.ticket_id}** claimed — I opened a thread for you.`,
      embeds: payload.embeds,
      components: [],
    });

    // Admin log, mirroring the claimTicket button flow.
    const adminChannel = interaction.client.channels.cache.get(process.env.CHANNEL_ADMIN_LOG);
    if (adminChannel) {
      await adminChannel
        .send(
          `🎫 Ticket #${ticket.ticket_id} claimed by <@${userId}> via /tickets at ` +
          `<t:${Math.floor(Date.now() / 1000)}:f>`,
        )
        .catch(() => {});
    }

    // Open a private thread for the claimer and post the ticket details.
    try {
      const thread = await interaction.channel.threads.create({
        name: `Ticket #${ticket.ticket_id} — ${ticket.title || 'Claimed'}`,
        autoArchiveDuration: 1440,
        reason: `Claimed via /tickets by ${userId}`,
      });
      await thread.members.add(userId);
      await thread.send(buildProductionEmbed(ticket));
      await thread.send(
        '💡 If you cannot produce one item, you should still produce the others. ' +
        'Mark the ticket as done after you picked up the items and delivered them to a stockpile.',
      );
      console.log(`[tickets] ticket #${ticket.ticket_id} claimed by ${userId}, thread: ${thread.id}`);

      // The only public message in the channel: announce the created thread.
      await interaction.channel.send({
        content: `🧵 <@${userId}> claimed **Ticket #${ticket.ticket_id}** — thread created: <#${thread.id}>`,
      });
    } catch (err) {
      console.error(`[tickets] could not create thread for ticket #${ticket.ticket_id}:`, err.message);
      await interaction.followUp({
        content: '❌ Ticket claimed, but I could not create the thread. Please contact an admin.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  },
};

export default [categoriesSelect, claimSelect];