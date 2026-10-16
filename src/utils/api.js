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
// ── Storages ─────────────────────────────────────────────────────────────────

export async function getAllStorages() {
  const { data } = await api.get('/storages');
  return data; // [{ name, hex, city, code, isBunker, last_updated }]
}

// ── Item search ───────────────────────────────────────────────────────────────

export async function searchItems(term) {
  const { data } = await api.get('/items/search', { params: { term } });
  return data; // { items: [{ name, shortname, image, details: [...] }] }
}

// ── AI assistant ─────────────────────────────────────────────────────────────

export async function askAssistant(discordUserId, message, history = []) {
  // LLM responses can take a while — use a longer timeout than the default.
  // The assistant may run several tool rounds, each a separate slow LLM call
  // (measured 100-195s per round), so this has to cover the whole investigation,
  // not one round.
  //
  // The ladder, innermost to outermost:
  //   Laravel per-call LLM_TIMEOUT  240s  (one upstream LLM call)
  //   php-fpm request_terminate_timeout 620s
  //   Apache ProxyTimeout          600s   (veli.team vhost)
  //   this axios timeout           660s
  //
  // This must stay ABOVE Apache's 600s so the server's own 504 is what we
  // receive, rather than us bailing out first and reporting something that
  // isn't what actually happened. 660s also keeps us inside the 15-minute
  // Discord interaction window, since the reply arrives via deferReply.
  const { data } = await api.post(
    '/bot/assistant/chat',
    { discord_user_id: discordUserId, message, history },
    { timeout: 660000 },
  );
  return data; // { reply, remaining_today }
}

// ── Server statistics ──────────────────────────────────────────────────────────

export async function postStatsEvents(events) {
  const { data } = await api.post('/bot/stats/events', { events });
  return data; // { inserted }
}

export async function postStatsVoiceSnapshots(snapshots) {
  const { data } = await api.post('/bot/stats/voice', { snapshots });
  return data; // { inserted, duplicates }
}

