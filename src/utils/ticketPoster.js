import { getOpenTickets, getLeaderboard, setTicketMessage } from './api.js';
import { buildProductionEmbed, buildLeaderboardEmbed, buildDeliveryRequestEmbed } from '../embeds/index.js';

const CHANNEL_MAP = {
  mpf:                  process.env.CHANNEL_MPF,
  factory:              process.env.CHANNEL_FACTORY,
  resources:            process.env.CHANNEL_RESOURCES,
  vehicles_structures:  process.env.CHANNEL_VEHICLES_STRUCTURES,
};

// Cache of last known state per ticket type — used to skip unnecessary edits.
// Key = type, value = JSON string of ticket IDs + statuses.
const lastSyncState = new Map();

/**
 * Sync all open tickets for a given type into the right channel.
 * Edits existing messages when possible, posts new ones only when needed.
 * Messages for tickets that no longer exist are stripped of buttons.
 */
export async function syncTickets(client, type) {
  const channelId = CHANNEL_MAP[type];
  if (!channelId) {
    console.warn(`[sync] ${type}: CHANNEL_${type.toUpperCase()} env var not set — skipping`);
    return 0;
  }

  const channel = client.channels.cache.get(channelId);
  if (!channel) {
    console.warn(`[sync] ${type}: channel ${channelId} not found in bot cache — check permissions / channel ID`);
    return 0;
  }

  let tickets;
  try {
    tickets = await getOpenTickets(type);
  } catch (err) {
    console.error(`[sync] ${type}: API request failed —`, err.message);
    return 0;
  }

  if (!Array.isArray(tickets)) tickets = [];

  console.log(`[sync] ${type}: ${tickets.length} open ticket(s) found`);

  // Build a map of ticket_id → ticket data
  const ticketMap = new Map(tickets.map(t => [String(t.ticket_id), t]));

  // Quick check: has anything changed since the last sync?
  // Include items in the signature so item-only changes are detected.
  const currentState = JSON.stringify(tickets.map(t =>
    `${t.ticket_id}:${t.status}:${t.items?.map(i => `${i.item_id}:${i.quantity_needed}`).join(',')}`
  ).sort());
  const cachedState = lastSyncState.get(type);
  if (cachedState === currentState) {
    // Nothing changed — skip the entire sync for this type
    return 0;
  }
  lastSyncState.set(type, currentState);

  // Fetch existing bot messages in the channel (paginate to find them)
  const existingMessages = new Map(); // discord_message_id → message
  let lastId;
  try {
    while (true) {
      const options = { limit: 100 };
      if (lastId) options.before = lastId;

      const messages = await channel.messages.fetch(options);
      if (messages.size === 0) break;

      for (const [, msg] of messages) {
        if (msg.author.id === client.user.id && msg.embeds.length > 0) {
          // Extract ticket_id from the footer text "Ticket #123"
          const footerText = msg.embeds[0]?.footer?.text || '';
          const match = footerText.match(/Ticket #(\d+)/);
          if (match) {
            existingMessages.set(String(match[1]), msg);
          }
        }
      }

      lastId = messages.last()?.id;
    }
  } catch (err) {
    console.error(`[sync] ${type}: error fetching existing messages —`, err.message);
  }

  let posted = 0;

  // Update or post messages for each open ticket
  for (const ticket of tickets) {
    const ticketId = String(ticket.ticket_id);
    const existingMsg = existingMessages.get(ticketId);

    try {
      const payload = buildProductionEmbed(ticket);

      if (existingMsg) {
        // Edit existing message with updated embed
        await existingMsg.edit(payload);
      } else {
        // Post new message
        const newMsg = await channel.send(payload);
        // Record the message ID back in the database
        try {
          await setTicketMessage(ticketId, newMsg.id);
        } catch (err) {
          console.error(`[sync] ${type}: failed to save message ID for ticket #${ticketId} —`, err.message);
        }
      }
      posted++;
    } catch (err) {
      console.error(`[sync] ${type}: failed to post/edit ticket #${ticketId} —`, err.message);
    }
  }

  // Clean up messages that no longer correspond to open tickets.
  // "No tickets available" placeholders (Ticket #0) are reused as slots
  // for new tickets. Other stale messages get their buttons stripped.
  let placeholderIdx = 0;
  const placeholders = [];

  for (const [ticketId, msg] of existingMessages) {
    if (!ticketMap.has(ticketId)) {
      if (ticketId === '0') {
        placeholders.push(msg);
      } else {
        try {
          await msg.edit({ components: [] });
        } catch {
          // Message may have been deleted by user, that's fine
        }
      }
    }
  }

  // Use placeholder messages as slots for new tickets instead of posting extras
  for (const placeholder of placeholders) {
    if (placeholderIdx < tickets.length) {
      const ticket = tickets[placeholderIdx];
      try {
        const payload = buildProductionEmbed(ticket);
        await placeholder.edit(payload);
        try {
          await setTicketMessage(String(ticket.ticket_id), placeholder.id);
        } catch {
          // Non-critical
        }
      } catch (err) {
        console.error(`[sync] ${type}: failed to edit placeholder for ticket #${ticket.ticket_id} —`, err.message);
      }
      placeholderIdx++;
    } else {
      // No more tickets — make placeholder read-only
      try {
        await placeholder.edit({ components: [] });
      } catch {
        // Non-critical
      }
    }
  }

  console.log(`[sync] ${type}: ${posted}/${tickets.length} ticket(s) synced`);
  return posted;
}

/**
 * Update the leaderboard message. Edits the existing message if found,
 * otherwise posts a new one. Searches the channel for a bot message
 * with the leaderboard embed title to find the existing one.
 */
export async function syncLeaderboard(client) {
  const channel = client.channels.cache.get(process.env.CHANNEL_LEADERBOARD);
  if (!channel) return;

  // Fetch recent messages from the bot to find the existing leaderboard
  let existingMsg = null;
  try {
    const messages = await channel.messages.fetch({ limit: 50 });
    existingMsg = messages.find(
      m => m.author.id === client.user.id &&
           m.embeds.length > 0 &&
           m.embeds[0].title === '🏆 Leaderboard'
    );
  } catch {
    // Could not fetch messages, will post a new one
  }

  // Resolve Discord display names for each player
  const players = await getLeaderboard();

  for (const player of players) {
    try {
      // Try guild member first (shows server nickname), fall back to global user
      const member = await channel.guild.members.fetch(player.discord_user_id).catch(() => null);
      if (member) {
        player.displayName = member.displayName || member.user.username;
      } else {
        const user = await client.users.fetch(player.discord_user_id).catch(() => null);
        player.displayName = user ? user.username : `User ${player.discord_user_id}`;
      }
    } catch {
      player.displayName = `User ${player.discord_user_id}`;
    }
    console.log(`[leaderboard] resolved ${player.discord_user_id} → ${player.displayName}`);
  }

  const payload = buildLeaderboardEmbed(players);

  if (existingMsg) {
    try {
      await existingMsg.edit(payload);
      return existingMsg.id;
    } catch {
      // Edit failed, fall through to post a new one
    }
  }

  const msg = await channel.send(payload);
  return msg.id;
}

/**
 * Post the persistent delivery request button if one doesn't already exist.
 * Searches for an existing bot message with the delivery request embed title.
 */
export async function postDeliveryRequestButton(client) {
  const channelId = process.env.CHANNEL_DELIVERY;
  if (!channelId) return;

  const channel = client.channels.cache.get(channelId);
  if (!channel) return;

  // Check if delivery request message already exists
  try {
    const messages = await channel.messages.fetch({ limit: 50 });
    const existing = messages.find(
      m => m.author.id === client.user.id &&
           m.embeds.length > 0 &&
           m.embeds[0].title === '🚛 Request a Delivery'
    );
    if (existing) {
      console.log(`[sync] delivery request already exists — skipping`);
      return;
    }
  } catch {
    // Could not fetch messages, proceed to post a new one
  }

  const payload = buildDeliveryRequestEmbed();
  await channel.send(payload);
}