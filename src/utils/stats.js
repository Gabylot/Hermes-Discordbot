import { ChannelType, MessageType } from 'discord.js';
import { postStatsEvents, postStatsVoiceSnapshots } from './api.js';

// Server activity statistics: joins, leaves, messages and verification-button
// presses are queued in memory and flushed to the Hermes API in batches;
// voice-channel occupancy is snapshotted on an interval. All timestamps are
// UTC ISO strings — Hermes stores them as-is, and everything can be filtered
// and graphed later via its /bot/stats endpoints.
//
// Queue is in-memory by design: a restart loses at most one flush interval
// (30s) of events, which is an acceptable trade for not persisting anything
// locally.

const FLUSH_INTERVAL_MS = 30_000;
const FLUSH_BATCH_SIZE = 500; // matches Hermes' max:1000 validation with headroom
const QUEUE_CAP = 50_000;     // safety valve — drop oldest if Hermes is down for ages

const VOICE_INTERVAL_MIN = parseInt(process.env.STAT_VOICE_INTERVAL_MIN || '5', 10);
// Stats only cover the main (CWD) guild — the bot also sits in a few other
// servers whose traffic must not pollute these numbers.
const STATS_GUILD_ID = process.env.DISCORD_GUILD_ID || null;
const AFK_CHANNEL_IDS = new Set(
  (process.env.STAT_AFK_CHANNEL_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

let queue = [];
let flushing = false;

/**
 * Queue one activity event. occurred_at is taken at call time so batching
 * doesn't smear timestamps.
 */
export function trackEvent(type, { userId = null, channelId = null, meta = null } = {}) {
  queue.push({
    type,
    discord_user_id: userId,
    channel_id: channelId,
    occurred_at: new Date().toISOString(),
    meta,
  });
  if (queue.length >= QUEUE_CAP) {
    const dropped = queue.length - QUEUE_CAP;
    queue.splice(0, dropped);
    console.warn(`[stats] queue full, dropped ${dropped} oldest event(s)`);
  }
}

/** Flush the queue to Hermes in batches. Retries left-over on next tick. */
export async function flushEvents() {
  if (flushing || queue.length === 0) return;
  flushing = true;
  try {
    while (queue.length > 0) {
      const batch = queue.slice(0, FLUSH_BATCH_SIZE);
      await postStatsEvents(batch);
      queue.splice(0, batch.length);
    }
  } catch (err) {
    // Batch stays at the front of the queue — retried on the next tick.
    console.error(`[stats] flush to Hermes failed (${err.message}), ${queue.length} event(s) queued for retry`);
    if (queue.length > QUEUE_CAP) {
      const dropped = queue.length - QUEUE_CAP;
      queue.splice(0, dropped);
      console.warn(`[stats] retry backlog over cap, dropped ${dropped} oldest event(s)`);
    }
  } finally {
    flushing = false;
  }
}

/**
 * Take one occupancy sample of all voice/stage channels (AFK channel skipped,
 * bots counted separately) and POST it to Hermes.
 */
export async function takeVoiceSnapshot(guild) {
  const takenAt = new Date().toISOString();
  const snapshots = [];

  for (const [, channel] of guild.channels.cache) {
    if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) continue;
    if (AFK_CHANNEL_IDS.has(channel.id)) continue;

    let members = 0;
    let bots = 0;
    for (const [, member] of channel.members) {
      if (member.user.bot) bots++;
      else members++;
    }
    snapshots.push({
      taken_at: takenAt,
      channel_id: channel.id,
      channel_name: channel.name.slice(0, 100),
      member_count: members,
      bot_count: bots,
    });
  }

  if (snapshots.length === 0) return 0;
  await postStatsVoiceSnapshots(snapshots);
  return snapshots.length;
}

/**
 * Wire up all stats collection on the client: join/leave/message listeners
 * plus the voice snapshot interval. Own listeners — the welcome/ghost-thread
 * event files stay independent of stats.
 */
export function initStats(client) {
  const inStatsGuild = (guildId) => !STATS_GUILD_ID || guildId === STATS_GUILD_ID;

  client.on('guildMemberAdd', (member) => {
    if (!inStatsGuild(member.guild.id)) return;
    trackEvent('join', {
      userId: member.id,
      meta: { nickname: member.displayName },
    });
  });

  client.on('guildMemberRemove', (member) => {
    if (!inStatsGuild(member.guild?.id)) return;
    trackEvent('leave', { userId: member.id });
  });

  client.on('messageCreate', (message) => {
    // Humans only, real chat messages only (no system messages, no DMs),
    // and only in the main guild.
    if (!message.guild || message.author.bot) return;
    if (!inStatsGuild(message.guild.id)) return;
    if (message.type !== MessageType.Default) return;
    trackEvent('message', {
      userId: message.author.id,
      channelId: message.channelId,
    });
  });

  setInterval(() => {
    flushEvents().catch(() => {});
  }, FLUSH_INTERVAL_MS);

  if (VOICE_INTERVAL_MIN > 0) {
    const voiceTick = () => {
      const guild = STATS_GUILD_ID
        ? client.guilds.cache.get(STATS_GUILD_ID)
        : client.guilds.cache.first();
      if (!guild) return;
      takeVoiceSnapshot(guild).catch((err) => {
        console.error(`[stats] voice snapshot failed: ${err.message}`);
      });
    };
    // First tick after login (init runs pre-login, when the cache is empty);
    // small delay lets GUILD_CREATE populate the cache first.
    client.once('ready', () => setTimeout(voiceTick, 2000));
    setInterval(voiceTick, VOICE_INTERVAL_MIN * 60_000);
  }

  console.log(
    `[stats] activity tracking enabled (voice every ${VOICE_INTERVAL_MIN}m` +
      `${AFK_CHANNEL_IDS.size ? `, AFK ignored: ${[...AFK_CHANNEL_IDS].join(', ')}` : ''}` +
      `${STATS_GUILD_ID ? `, guild ${STATS_GUILD_ID}` : ''})`,
  );
}
