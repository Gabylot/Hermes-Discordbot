import axios from 'axios';

const api = axios.create({
  baseURL: process.env.API_BASE_URL,
  headers: {
    'X-API-TOKEN': process.env.API_SECRET,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  timeout: 10000,
});

// ── Tickets ──────────────────────────────────────────────────────────────────

export async function getOpenTickets(type) {
  // type: 'factory' | 'mpf' | 'facility'
  const { data } = await api.get('/bot/tickets', { params: { type, status: 'open' } });
  return data;
}

export async function getClaimTicket(ticketId, discordUserId) {
  const { data } = await api.post(`/bot/tickets/${ticketId}/claim`, { discord_user_id: discordUserId });
  return data;
}

export async function cancelTicket(ticketId, discordUserId) {
  const { data } = await api.post(`/bot/tickets/${ticketId}/cancel`, { discord_user_id: discordUserId });
  return data;
}

export async function regenerateTickets() {
  const { data } = await api.post('/bot/tickets/regenerate');
  return data;
}

export async function completeTicket(ticketId, discordUserId) {
  const { data } = await api.post(`/bot/tickets/${ticketId}/complete`, { discord_user_id: discordUserId });
  return data;
}

// ── Delivery ─────────────────────────────────────────────────────────────────

export async function getDeliveryPossible(options = {}) {
  const { data } = await api.get('/bot/delivery/possible', { params: options });
  return data;
}

export async function buildDeliveryJob(discordUserId, productionCityId, frontlineCityId, containerCount, includeStructures) {
  const { data } = await api.post('/bot/delivery/build', {
    discord_user_id: discordUserId,
    production_city_id: productionCityId,
    frontline_city_id: frontlineCityId,
    container_count: containerCount,
    include_structures: includeStructures,
  });

  return data; // { contract_id, production_city, frontline_city, allocation, totals, container_count }
}

export async function cancelDelivery(contractId, discordUserId) {
  const { data } = await api.post(`/bot/delivery/${contractId}/cancel`, { discord_user_id: discordUserId });
  return data;
}

export async function completeDelivery(contractId, discordUserId) {
  const { data } = await api.post(`/bot/delivery/${contractId}/complete`, { discord_user_id: discordUserId });
  return data;
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export async function getLeaderboard() {
  const { data } = await api.get('/bot/leaderboard');
  return data; // [{ discord_user_id, score, deliveries, tickets }]
}

// ── Cities ───────────────────────────────────────────────────────────────────

export async function getCities() {
  const { data } = await api.get('/bot/cities');
  return data;
}