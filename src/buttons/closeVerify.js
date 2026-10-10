import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { archiveVerificationThread } from '../utils/verifyArchive.js';

export default {
  customId: 'verify_close',
  async execute(interaction) {
    // NCOs and Officers only — whoever holds Manage Threads in this channel.
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageThreads)) {
      await interaction.reply({
        content: '❌ Only NCOs and Officers can close verification threads.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const thread = interaction.channel;
    if (!thread?.isThread()) {
      await interaction.editReply({ content: '❌ This button only works inside a verification thread.' });
      return;
    }

    const archived = await archiveVerificationThread(thread, interaction.user);
    if (!archived) {
      // Keep the thread — history is never thrown away silently.
      await interaction.editReply({
        content: '❌ Could not archive this thread, so it has been kept. Please contact an admin.',
      });
      return;
    }

    await interaction.editReply({ content: '✅ Thread archived — removing it now…' }).catch(() => {});
    try {
      await thread.delete();
      console.log(`[verify_close] ${thread.name} archived & closed by ${interaction.user.tag}`);
    } catch (err) {
      console.error('[verify_close] archived, but could not delete the thread:', err.message);
    }
  },
};
