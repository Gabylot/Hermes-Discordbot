import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { buildVerificationEmbed } from '../embeds/index.js';

export default {
  data: new SlashCommandBuilder()
    .setName('verification-post')
    .setDescription('Post the verification message (Join CWD / Get Ally Role) to this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    if (!interaction.channel?.isTextBased() || interaction.channel.isThread()) {
      await interaction.reply({
        content: '❌ Run this in a regular channel, not a thread.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const message = await interaction.channel.send(buildVerificationEmbed());
      await interaction.editReply({ content: `✅ Verification message posted: ${message.url}` });
      console.log(`[verification] posted verification message in #${interaction.channel.name} by ${interaction.user.tag}`);
    } catch (err) {
      console.error('[verification-post] failed:', err);
      await interaction.editReply({ content: '❌ Could not post the verification message.' });
    }
  },
};
