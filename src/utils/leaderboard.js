/**
 * Resolve the Discord display name for every player in a leaderboard payload.
 *
 * Prefers the server nickname (guild member), then the global username, then
 * a raw "User <id>" fallback. Mutates each player (adds `displayName`) and
 * returns the same array so callers can chain it:
 *
 *   await resolveLeaderboardDisplayNames(client, players);
 *   buildLeaderboardEmbed(players);
 */
export async function resolveLeaderboardDisplayNames(client, players) {
  // Use the configured guild (or the first one the client can see) so we can
  // show server nicknames even without a specific channel reference.
  const guild =
    client.guilds.cache.get(process.env.DISCORD_GUILD_ID) ||
    client.guilds.cache.first();

  for (const player of players || []) {
    try {
      let member = null;
      if (guild) {
        member = await guild.members.fetch(player.discord_user_id).catch(() => null);
      }

      if (member) {
        player.displayName = member.displayName || member.user.username;
      } else {
        const user = await client.users.fetch(player.discord_user_id).catch(() => null);
        player.displayName = user ? user.username : `User ${player.discord_user_id}`;
      }
    } catch {
      player.displayName = `User ${player.discord_user_id}`;
    }

    console.log(`[leaderboard] resolved ${player.discord_user_id} → ${player.displayName}`);
  }

  return players;
}