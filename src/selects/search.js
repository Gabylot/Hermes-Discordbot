import { MessageFlags } from 'discord.js';
import { searchSessions } from '../commands/search.js';
import { buildSearchEmbed } from '../embeds/index.js';

export default {
  customId: 'search_pick_item',
  async execute(interaction) {
    await interaction.deferUpdate();

    const session = searchSessions.get(interaction.message.id);
    if (!session || session.userId !== interaction.user.id) {
      await interaction.followUp({
        content: '⚠️ Session expired or not yours. Run `/search` again.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const index = Number(interaction.values[0]);
    const item = session.items[index];
    if (!item) {
      await interaction.followUp({
        content: '❌ That item is no longer available. Run `/search` again.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const payload = buildSearchEmbed(item);
    await interaction.editReply(payload);

    // Session is no longer needed after the selection is shown.
    searchSessions.delete(interaction.message.id);
  },
};