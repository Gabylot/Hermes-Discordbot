// Greets new members in the enlistees channel, mirroring the old Quartermaster
// bot: welcome message pointing at #welcome and the verification channel.
// Channel IDs come from env so tests can retarget the message elsewhere.
const ENLISTEES_CHANNEL_ID = process.env.CHANNEL_ENLISTEES;
const WELCOME_CHANNEL_ID = process.env.CHANNEL_WELCOME;
const VERIFY_CHANNEL_ID = process.env.CHANNEL_VERIFICATION;

export default {
  name: 'guildMemberAdd',
  once: false,
  async execute(member, client) {
    try {
      if (!ENLISTEES_CHANNEL_ID || !WELCOME_CHANNEL_ID || !VERIFY_CHANNEL_ID) {
        console.error('[enlist] CHANNEL_ENLISTEES / CHANNEL_WELCOME / CHANNEL_VERIFICATION not all set');
        return;
      }
      const channel = await client.channels.fetch(ENLISTEES_CHANNEL_ID).catch(() => null);
      if (!channel?.isTextBased()) {
        console.error('[enlist] enlistees channel missing or not text-based:', ENLISTEES_CHANNEL_ID);
        return;
      }
      await channel.send(
        `Welcome <@${member.id}> to the Colonial War Dogs regiment! ` +
          `Check out <#${WELCOME_CHANNEL_ID}> and <#${VERIFY_CHANNEL_ID}> to get started!`,
      );
      console.log(`[enlist] welcomed ${member.user?.tag ?? member.id} in #${channel.name}`);
    } catch (err) {
      console.error('[enlist] failed to post welcome:', err.message);
    }
  },
};
