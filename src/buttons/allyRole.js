import { MessageFlags } from 'discord.js';
import {
  openRecruitThread,
  hasRole,
  NCO_ROLE_ID,
  OFFICER_ROLE_ID,
  VERIFIED_ROLE_ID,
  ALLIED_ROLE_ID,
} from '../utils/recruitThread.js';
import { trackEvent } from '../utils/stats.js';

export default {
  customId: 'join_ally',
  async execute(interaction) {
    // Verified players and current allies don't need a new verification thread.
    // (Allies CAN still use the Join CWD button - checked only here.)
    if (hasRole(interaction, VERIFIED_ROLE_ID)) {
      trackEvent('button_join_ally', {
        userId: interaction.user.id,
        meta: { outcome: 'already_verified' },
      });
      await interaction.reply({
        content: '✅ You\'re already verified - no need to verify again. Head into the server and have fun!',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (hasRole(interaction, ALLIED_ROLE_ID)) {
      trackEvent('button_join_ally', {
        userId: interaction.user.id,
        meta: { outcome: 'already_ally' },
      });
      await interaction.reply({
        content: '🤝 You\'re already an ally - no need to verify again. Your ally access is active.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    trackEvent('button_join_ally', {
      userId: interaction.user.id,
      meta: { outcome: 'thread_opened' },
    });

    await openRecruitThread(interaction, {
      prefix: 'ally',
      welcome: (userId) =>
        `Hey <@${userId}>, welcome! 👋\n\n` +
        `To get the ally role, drop a quick **F1 screenshot** here so we can confirm who you are.\n\n` +
        `<@&${NCO_ROLE_ID}> <@&${OFFICER_ROLE_ID}> — a new ally is waiting for verification.`,
    });
  },
};
