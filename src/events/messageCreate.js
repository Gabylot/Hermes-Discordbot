import { MessageType } from 'discord.js';

// Greets new members in the enlistees channel, mirroring the old Quartermaster
// bot: welcome message pointing at #welcome and the verification channel.
//
// We deliberately wait for Discord's own join system message (USER_JOIN,
// posted ~25-65s after the actual join) instead of reacting to guildMemberAdd:
// Discord drops that system message when the user leaves again immediately,
// so gating on it means we never welcome someone who already vanished.
// Dependency: join system messages must stay enabled (Server Settings →
// System Messages); ready.js warns if they are suppressed.
const ENLISTEES_CHANNEL_ID = process.env.CHANNEL_ENLISTEES;
const WELCOME_CHANNEL_ID = process.env.CHANNEL_WELCOME;
const VERIFY_CHANNEL_ID = process.env.CHANNEL_VERIFICATION;

export default {
  name: 'messageCreate',
  once: false,
  async execute(message, client) {
    // Cheap type check first — this event fires for every message the bot sees.
    if (message.type !== MessageType.UserJoin) return;

    try {
      if (!ENLISTEES_CHANNEL_ID || !WELCOME_CHANNEL_ID || !VERIFY_CHANNEL_ID) {
        console.error('[enlist] CHANNEL_ENLISTEES / CHANNEL_WELCOME / CHANNEL_VERIFICATION not all set');
        return;
      }
      const userId = message.author?.id;
      if (!userId) return;

      const channel = await client.channels.fetch(ENLISTEES_CHANNEL_ID).catch(() => null);
      if (!channel?.isTextBased()) {
        console.error('[enlist] enlistees channel missing or not text-based:', ENLISTEES_CHANNEL_ID);
        return;
      }
      await channel.send(
        `Welcome <@${userId}> to the Colonial War Dogs regiment! ` +
          `Check out <#${WELCOME_CHANNEL_ID}> and <#${VERIFY_CHANNEL_ID}> to get started!`,
      );
      console.log(`[enlist] welcomed ${message.author.tag} in #${channel.name} (native join message seen)`);
    } catch (err) {
      console.error('[enlist] failed to post welcome:', err.message);
    }
  },
};
