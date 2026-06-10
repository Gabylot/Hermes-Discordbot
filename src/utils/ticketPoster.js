import { getOpenTickets, getLeaderboard } from './api.js';
import { buildProductionEmbed, buildLeaderboardEmbed, buildDeliveryRequestEmbed } from '../embeds/index.js';

const CHANNEL_MAP = {
  mpf:                  process.env.CHANNEL_MPF,
  factory:              process.env.CHANNEL_FACTORY,
  resources:            process.env.CHANNEL_RESOURCES,
  vehicles_structures:  process.env.CHANNEL_VEHICLES_STRUCTURES,
};

/**
 * Delete all bot messages in a channel. Used before re-posting tickets
 * after regeneration so the channel stays clean.
 */
export async function cleanChannel(client, type) {
  const channelId = CHANNEL_MAP[type];
  if (!channelId) return 0;

  const channel = client.channels.cache.get(channelId);
  if (!channel) return 0;

  let deleted = 0;
  let lastId;
  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;

    const messages = await channel.messages.fetch(options);
    if (messages.size === 0) break;

    const botMessages = messages.filter(m => m.author.id === client.user.id);
    if (botMessages.size > 0) {
      await channel.bulkDelete(botMessages);
      deleted += botMessages.size;
    }

    lastId = messages.last()?.id;
  }

  return deleted;
}

/**
 * Post all open tickets for a given type into the right channel.
 * Call this on bot startup and/or on a polling interval.
 * Returns the number of tickets posted.
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

  if (!Array.isArray(tickets) || tickets.length === 0) {
    console.log(`[sync] ${type}: 0 open tickets — nothing to post`);
    return 0;
  }

  console.log(`[sync] ${type}: ${tickets.length} open ticket(s) found`);

  let posted = 0;
  for (const ticket of tickets) {
    try {
      const payload = buildProductionEmbed(ticket);
      await channel.send(payload);
      posted++;
    } catch (err) {
      console.error(`[sync] ${type}: failed to post ticket #${ticket.ticket_id} —`, err.message);
    }
  }

  console.log(`[sync] ${type}: ${posted}/${tickets.length} ticket(s) posted`);
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
