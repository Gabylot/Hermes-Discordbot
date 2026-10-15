import { archiveVerificationThread } from '../utils/verifyArchive.js';
import { NCO_ROLE_ID, OFFICER_ROLE_ID } from '../utils/recruitThread.js';

// Auto-archive verification threads whose recruit/ally left the server, so
// staff aren't left chasing ghosts in threads that will never be finished.
export default {
  name: 'guildMemberRemove',
  once: false,
  async execute(member, client) {
    try {
      // Staff leave threads they merely joined to help in — only the thread's
      // own recruit/ally leaving should close it.
      if (member.roles?.cache?.has(NCO_ROLE_ID) || member.roles?.cache?.has(OFFICER_ROLE_ID)) return;

      const guild = member.guild;
      const { threads } = await guild.channels.fetchActiveThreads();

      for (const thread of threads.values()) {
        if (!thread.name.startsWith('recruit-') && !thread.name.startsWith('ally-')) continue;

        let isParticipant = false;
        try {
          const members = await thread.members.fetch();
          isParticipant = [...members.values()].some((tm) => tm.id === member.id);
        } catch (err) {
          console.warn(`[ghost] could not list members of #${thread.name}:`, err.message);
          continue;
        }
        if (!isParticipant) continue;

        const archived = await archiveVerificationThread(thread, client.user, {
          note: `**Note:** <@${member.id}> left the server before verification was finished.`,
        });
        if (archived) {
          await thread
            .delete()
            .catch((err) =>
              console.error(`[ghost] archived but could not delete #${thread.name}:`, err.message),
            );
          console.log(`[ghost] ${thread.name} archived after ${member.user?.tag ?? member.id} left`);
        }
      }
    } catch (err) {
      console.error('[ghost] guildMemberRemove failed:', err.message);
    }
  },
};
