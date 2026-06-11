import { syncTickets, syncLeaderboard, postDeliveryRequestButton } from '../utils/ticketPoster.js';

const TICKET_TYPES = ['mpf', 'factory', 'resources', 'vehicles_structures'];

export default {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`[bot] logged in as ${client.user.tag}`);
    client.user.setActivity('Veli Logistics', { type: 3 }); // Watching

    // Sync tickets — edits existing messages, posts new ones only when needed
    for (const type of TICKET_TYPES) {
      await syncTickets(client, type);
    }

    // Post delivery request button
    try {
      await postDeliveryRequestButton(client);
      console.log(`[sync] delivery button posted`);
    } catch (err) {
      console.error(`[sync] delivery button failed:`, err.message);
    }

    // Sync leaderboard
    try {
      await syncLeaderboard(client);
      console.log(`[sync] leaderboard posted`);
    } catch (err) {
      console.error(`[sync] leaderboard failed:`, err.message);
    }
  },
};