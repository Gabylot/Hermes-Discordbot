import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const IMAGE_BASE = (process.env.API_BASE_URL || '').replace(/\/api\/?$/, '') || 'https://veli.team';

// ── Production / Ticket Embed ────────────────────────────────────────────────

export function buildProductionEmbed(ticket) {
  const statusEmoji = ticket.status === 'open' ? '🟢' : '🟡';
  const claimedBy = ticket.discord_user_id
    ? `<@${ticket.discord_user_id}>`
    : (ticket.assigned_to || 'Unknown');
  const statusLabel = ticket.status === 'open' ? 'Open' : `Claimed by ${claimedBy}`;

  const embed = new EmbedBuilder()
    .setTitle(`${statusEmoji} ${ticket.title || 'Production Ticket #' + ticket.ticket_id}`)
    .setDescription(ticket.description || 'No description')
    .setColor(ticket.status === 'open' ? 0x2ecc71 : 0xf39c12)
    .addFields(
      { name: 'Status', value: statusLabel, inline: true },
      { name: 'Type', value: ticket.ticket_type || 'Unknown', inline: true },
    );

  if (ticket.has_cost) {
    embed.addFields(
      { name: 'Total Cost', value: ticket.total_cost, inline: true },
      { name: 'Total Crates', value: ticket.total_crates, inline: true },
    );
  }

  if (ticket.items && ticket.items.length > 0) {
    const itemList = ticket.items
      .map(i => `• **${i.name}** × ${i.quantity_needed}`)
      .join('\n');

    embed.addFields({ name: `Items (${ticket.items.length})`, value: itemList.slice(0, 1024) });
  }

  // Build action buttons
  const rows = [];

  if (ticket.status === 'open') {
    const claimRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`claim_ticket:${ticket.ticket_id}`)
        .setLabel('Claim')
        .setStyle(ButtonStyle.Primary),
    );
    rows.push(claimRow);
  }

  if (ticket.status === 'assigned' && ticket.discord_user_id) {
    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`done_ticket:${ticket.ticket_id}`)
        .setLabel('Done')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`cancel_ticket:${ticket.ticket_id}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger),
    );
    rows.push(actionRow);
  }

  return { embeds: [embed], components: rows };
}

// ── Delivery Request Embed (the persistent button in #delivery) ─────────────

export function buildDeliveryRequestEmbed() {
  const embed = new EmbedBuilder()
    .setTitle('🚛 Request a Delivery')
    .setDescription(
      'Click the button below to start a new delivery contract.\n' +
      'A private thread will open where you can specify how many containers you can carry.'
    )
    .setColor(0x3498db);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('delivery_request')
      .setLabel('New Delivery')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🚛'),
  );

  return { embeds: [embed], components: [row] };
}

// ── Delivery Ticket Embed (the actual delivery contract posted in a thread) ─

export function buildDeliveryTicketEmbed(contract, discordUserId) {
  const embed = new EmbedBuilder()
    .setTitle(`🚛 Delivery Contract #${contract.contract_id}`)
    .setDescription(
      `**Route:** ${contract.production_city} → ${contract.frontline_city}\n` +
      `**Containers:** ${contract.container_count}`
    )
    .setColor(0xe67e22);

  const totals = contract.totals || {};

  if (totals.crates || totals.special) {
    const parts = [];
    if (totals.crates) parts.push(`${totals.crates} crates`);
    if (totals.special) parts.push(`${totals.special} vehicle/shippable`);
    embed.addFields({ name: 'Load Summary', value: parts.join(', '), inline: true });
  }

  // Show item details with names and images
  if (contract.items && contract.items.length > 0) {
    const itemList = contract.items
      .map(i => `• **${i.item_name || `Item #${i.item_id}`}** × ${i.allocated}`)
      .join('\n');
    embed.addFields({ name: `Items to Load (${contract.items.length})`, value: itemList.slice(0, 1024) });

    // Set thumbnail to the first item's image
    const firstImage = contract.items.find(i => i.image)?.image;
    if (firstImage) {
      embed.setThumbnail(`${IMAGE_BASE}/images/item/${firstImage}`);
    }
  } else if (contract.allocation && Object.keys(contract.allocation).length > 0) {
    // Fallback: show allocation with IDs if items array is not available
    const allocEntries = Object.entries(contract.allocation)
      .filter(([, qty]) => qty > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    if (allocEntries.length > 0) {
      const allocText = allocEntries
        .map(([itemId, qty]) => `• Item #${itemId}: ${qty}`)
        .join('\n');
      embed.addFields({ name: 'Items to Load', value: allocText.slice(0, 1024) });
    }
  }

  embed.setFooter({ text: `Assigned to <@${discordUserId}>` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`done_delivery:${contract.contract_id}`)
      .setLabel('Done')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`cancel_delivery:${contract.contract_id}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row] };
}

// ── Leaderboard Embed ───────────────────────────────────────────────────────

export function buildLeaderboardEmbed(players) {
  const embed = new EmbedBuilder()
    .setTitle('🏆 Leaderboard')
    .setColor(0xf1c40f);

  if (!players || players.length === 0) {
    embed.setDescription('No deliveries or tickets completed yet.');
    return { embeds: [embed] };
  }

  const lines = players.map((p, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**#${i + 1}**`;
    const name = p.displayName || `<@${p.discord_user_id}>`;
    return `${medal} **${name}** — **${p.score}** pts (${p.deliveries} deliveries, ${p.tickets} tickets)`;
  });

  embed.setDescription(lines.join('\n'));

  return { embeds: [embed] };
}