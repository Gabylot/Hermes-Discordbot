import { MessageFlags } from 'discord.js';
import {
  openRecruitThread,
  hasRole,
  NCO_ROLE_ID,
  OFFICER_ROLE_ID,
  VERIFIED_ROLE_ID,
} from '../utils/recruitThread.js';

export default {
  customId: 'join_cwd',
  async execute(interaction) {
    // Already verified players don't need a new verification thread.
    if (hasRole(interaction, VERIFIED_ROLE_ID)) {
      await interaction.reply({
        content: '✅ You\'re already verified - no need to verify again. Head into the server and have fun!',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await openRecruitThread(interaction, {
      prefix: 'recruit',
      welcome: (userId) =>
        `Hello <@${userId}>, welcome to CWD! 🎉\n\n` +
        `<@&${NCO_ROLE_ID}> <@&${OFFICER_ROLE_ID}> — a new recruit has joined, come say hello! 👋`,
    });
  },
};
