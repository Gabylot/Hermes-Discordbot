import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  MessageFlags,
} from 'discord.js';

const IMAGE_BASE = (process.env.API_BASE_URL || '').replace(/\/api\/?$/, '') || 'https://veli.team';

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  open:      { emoji: '🟢', color: 0x2ecc71, label: 'Open'      },
  assigned:  { emoji: '🟡', color: 0xf39c12, label: 'Assigned'  },
  done:      { emoji: '✅', color: 0x27ae60, label: 'Done'       },
  cancelled: { emoji: '🔴', color: 0xe74c3c, label: 'Cancelled' },
};

function statusCfg(status) {
  return STATUS_CONFIG[status] ?? { emoji: '⚪', color: 0x95a5a6, label: status ?? 'Unknown' };
}

function itemImageUrl(image) {
  return image ? `${IMAGE_BASE}/images/item/${image}` : null;
}

// ── Production / Ticket Embed ─────────────────────────────────────────────────
// (stays as a classic embed — no per-item images needed here)

export function buildProductionEmbed(ticket) {
  const cfg = statusCfg(ticket.status);

  const claimedBy = ticket.discord_user_id
    ? `<@${ticket.discord_user_id}>`
    : (ticket.assigned_to || 'Unassigned');

  const statusValue = ticket.status === 'open' ? cfg.label : `${cfg.label} — ${claimedBy}`;

  const embed = new EmbedBuilder()
    .setTitle(`${cfg.emoji} ${ticket.title || `Production Ticket #${ticket.ticket_id}`}`)
    .setDescription(ticket.description || '*No description provided.*')
    .setColor(cfg.color)
    .setTimestamp()
    .addFields(
      { name: '📋 Status',  value: statusValue,                 inline: true },
      { name: '🏷️ Type',    value: ticket.ticket_type || 'N/A', inline: true },
    );

  if (ticket.has_cost) {
    embed.addFields(
      { name: '💰 Total Cost',   value: String(ticket.total_cost),   inline: true },
      { name: '📦 Total Crates', value: String(ticket.total_crates), inline: true },
    );
  }

  if (ticket.items?.length > 0) {
    const itemList = ticket.items
      .map(i => `\`${String(i.quantity_needed).padStart(3)}\` × **${i.name}**`)
      .join('\n');

    embed.addFields({
      name: `📦 Items (${ticket.items.length})`,
      value: itemList.slice(0, 1024),
    });
  }

  embed.setFooter({ text: `Ticket #${ticket.ticket_id}` });

  const rows = [];

  if (ticket.status === 'open') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`claim_ticket:${ticket.ticket_id}`)
          .setLabel('Claim Ticket')
          .setEmoji('🙋')
          .setStyle(ButtonStyle.Primary),
      ),
    );
  }

  if (ticket.status === 'assigned' && ticket.discord_user_id) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`done_ticket:${ticket.ticket_id}`)
          .setLabel('Mark Done')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`cancel_ticket:${ticket.ticket_id}`)
          .setLabel('Cancel')
          .setEmoji('🗑️')
          .setStyle(ButtonStyle.Danger),
      ),
    );
  }

  return { embeds: [embed], components: rows };
}

// ── Delivery Request Embed (persistent button in #delivery) ───────────────────
// (no per-item images — stays as a classic embed)

export function buildDeliveryRequestEmbed() {
  const embed = new EmbedBuilder()
    .setTitle('🚛 Request a Delivery')
    .setDescription(
      'Need supplies moved to the frontline?\n\n' +
      'Click **New Delivery** to open a private thread. ' +
      "You'll be asked how many containers you can carry, " +
      'and a contract will be generated for you.'
    )
    .setColor(0x3498db)
    .setFooter({ text: 'One contract per request — open a new thread for each run.' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('delivery_request')
      .setLabel('New Delivery')
      .setEmoji('🚛')
      .setStyle(ButtonStyle.Primary),
  );

  return { embeds: [embed], components: [row] };
}

// ── Delivery Ticket — Components V2 ──────────────────────────────────────────
//
// Each item gets its own Section: quantity + name on the left, item image on
// the right. Requires MessageFlags.IsComponentsV2 on the message.
//
// NOTE: Components V2 messages cannot use `content` or `embeds`. All layout
// lives inside ContainerBuilder components.

export function buildDeliveryTicketEmbed(contract, discordUserId) {
  const totals   = contract.totals ?? {};
  const hasItems = contract.items?.length > 0;

  // ── Load summary line ──
  const loadParts = [];
  if (totals.crates)  loadParts.push(`**${totals.crates}** crates`);
  if (totals.special) loadParts.push(`**${totals.special}** vehicle/shippable`);
  const loadSummary = loadParts.length ? loadParts.join(' · ') : 'Nothing allocated yet.';

  // ── Build a single Container (gives the accent bar + grouped layout) ──
  const container = new ContainerBuilder();

  // Header block
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## 🚛 Delivery Contract #${contract.contract_id}\n` +
      `**Route:** ${contract.production_city} → ${contract.frontline_city}  ·  ` +
      `**Containers:** ${contract.container_count}\n` +
      `**Load:** ${loadSummary}\n` +
      `Assigned to <@${discordUserId}>`
    ),
  );

  // ── Item sections (one per item, thumbnail on the right) ──
  if (hasItems) {
    container.addSeparatorComponents(new SeparatorBuilder());

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### 🗃️ Items to Load (${contract.items.length})`),
    );

    for (const item of contract.items) {
      const name     = item.item_name || `Item #${item.item_id}`;
      const qty      = String(item.allocated).padStart(3);
      const imageUrl = itemImageUrl(item.image);

      const section = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`\`${qty}\` × **${name}**`),
        );

      if (imageUrl) {
        section.setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(imageUrl)
            .setDescription(name),
        );
      }

      container.addSectionComponents(section);
    }
  } else if (Object.keys(contract.allocation ?? {}).length > 0) {
    // Fallback when items aren't populated — no images available
    container.addSeparatorComponents(new SeparatorBuilder());

    const allocLines = Object.entries(contract.allocation)
      .filter(([, qty]) => qty > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([id, qty]) => `\`${String(qty).padStart(3)}\` × Item #${id}`)
      .join('\n');

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### 🗃️ Items to Load\n${allocLines}`),
    );
  }

  // ── Action buttons ──
  container.addSeparatorComponents(new SeparatorBuilder());

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`done_delivery:${contract.contract_id}`)
        .setLabel('Delivery Done')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`cancel_delivery:${contract.contract_id}`)
        .setLabel('Cancel')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger),
    ),
  );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}

// ── Leaderboard Embed ─────────────────────────────────────────────────────────

const MEDALS = ['🥇', '🥈', '🥉'];

export function buildLeaderboardEmbed(players) {
  const embed = new EmbedBuilder()
    .setTitle('🏆 Leaderboard')
    .setColor(0xf1c40f)
    .setTimestamp();

  if (!players?.length) {
    embed.setDescription('No deliveries or tickets completed yet.\nBe the first on the board!');
    return { embeds: [embed] };
  }

  const lines = players.map((p, i) => {
    const rank  = MEDALS[i] ?? `**#${i + 1}**`;
    const name  = p.displayName || `<@${p.discord_user_id}>`;
    const score = `**${p.score}** pts`;
    const stats = `${p.deliveries} 🚛 · ${p.tickets} 🎫`;
    return `${rank} ${name} — ${score}  *(${stats})*`;
  });

  embed.setDescription(lines.join('\n'));
  embed.setFooter({ text: `${players.length} players ranked` });

  return { embeds: [embed] };
}