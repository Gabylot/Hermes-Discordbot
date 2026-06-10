import { getOpenTickets, getLeaderboard } from './api.js';
import { buildProductionEmbed, buildLeaderboardEmbed, buildDeliveryRequestEmbed } from '../embeds/index.js';

const CHANNEL_MAP = {
  factory:  process.env.CHANNEL_FACTORY,
  mpf:      process.env.CHANNEL_MPF,
  facility: process.env.CHANNEL_FACILITY,
};

/**
 * Post all open tickets for a given type into the right channel.
 * Call this on bot startup and/or on a polling interval.
 */
export async function syncTickets(client, type) {
  const channelId = CHANNEL_MAP[type];
  if (!channelId) return;

  const channel = client.channels.cache.get(channelId);
  if (!channel) return;

  const tickets = await getOpenTickets(type);

  for (const ticket of tickets) {
    await channel.send(buildProductionEmbed(ticket));
  }
}

/**
 * Update the leaderboard message. Posts a new one if none exists.
 * Store the message ID somewhere persistent (DB or a flat file) to edit it next time.
 */
export async function syncLeaderboard(client, existingMessageId = null) {
  const channel = client.channels.cache.get(process.env.CHANNEL_LEADERBOARD);
  if (!channel) return;

  const players = await getLeaderboard();
  const embed = buildLeaderboardEmbed(players);

  if (existingMessageId) {
    try {
      const msg = await channel.messages.fetch(existingMessageId);
      await msg.edit({ embeds: [embed] });
      return existingMessageId;
    } catch {
      // Message was deleted, fall through to post a new one
    }
  }

  const msg = await channel.send({ embeds: [embed] });
  return msg.id; // save this ID so you can edit it next time
}

/**
 * Post the persistent delivery request button. Run once manually.
 */
export async function postDeliveryRequestButton(client) {
  const channel = client.channels.cache.get(process.env.CHANNEL_DELIVERY);
  if (!channel) return;
  await channel.send(buildDeliveryRequestEmbed());
}
