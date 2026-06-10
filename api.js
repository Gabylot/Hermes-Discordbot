import axios from 'axios';

const api = axios.create({
  baseURL: process.env.API_BASE_URL,
  headers: {
    'Authorization': `Bearer ${process.env.API_SECRET}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  timeout: 10000,
});

// ── Tickets ──────────────────────────────────────────────────────────────────

export async function getOpenTickets(type) {
  // type: 'factory' | 'mpf' | 'facility'
  const { data } = await api.get(`/tickets?type=${type}&status=open`);
  return data;
}

export async function claimTicket(ticketId, discordUserId) {
  const { data } = await api.patch(`/tickets/${ticketId}/claim`, { discord_user_id: discordUserId });
  return data;
}

export async function completeTicket(ticketId, discordUserId) {
  const { data } = await api.patch(`/tickets/${ticketId}/complete`, { discord_user_id: discordUserId });
  return data;
}

// ── Delivery ─────────────────────────────────────────────────────────────────

export async function buildDeliveryJob(discordUserId, containerCount, includeStructures) {
  // Backend calculates the manifest based on global demand and player input
  const { data } = await api.post('/delivery/build', {
    discord_user_id: discordUserId,
    container_count: containerCount,
    include_structures: includeStructures,
  });
  return data; // { route, manifest, container_count, structures }
}

export async function completeDelivery(deliveryId, discordUserId) {
  const { data } = await api.patch(`/delivery/${deliveryId}/complete`, { discord_user_id: discordUserId });
  return data;
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export async function getLeaderboard() {
  const { data } = await api.get('/leaderboard');
  return data; // [{ discord_user_id, username, score, deliveries, tickets }]
}
