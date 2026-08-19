import { SlashCommandBuilder } from 'discord.js';
import { getLeaderboard } from '../utils/api.js';
import { buildLeaderboardEmbed } from '../embeds/index.js';
import { resolveLeaderboardDisplayNames } from '../utils/leaderboard.js';

export default {
  data: new SlashCommandBuilder()
    .setName('highscore')
    .setDescription('Shows the leaderboard — top players by score'),
  async execute(interaction) {
    // Defer so the backend request (and name lookups) have time to complete
    await interaction.deferReply();

    let players;
    try {
      players = await getLeaderboard();
    } catch (err) {
      console.error('[highscore] failed to fetch leaderboard:', err.message);
      await interaction.editReply('❌ Could not fetch the leaderboard from the backend.');
      return;
    }

    // Resolve Discord display names so the embed shows nicknames, not just ids.
    await resolveLeaderboardDisplayNames(interaction.client, players);

    await interaction.editReply(buildLeaderboardEmbed(players));
  },
};