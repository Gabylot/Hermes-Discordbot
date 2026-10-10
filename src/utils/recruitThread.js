import {
  ChannelType,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';

// Staff roles pinged in the thread opener. NCOs and Officers hold Manage
// Threads in the channels this runs in, so they can already see the thread —
// no per-member thread adds are needed for them.
export const NCO_ROLE_ID = process.env.ROLE_NCO || '1345601386469134416';
export const OFFICER_ROLE_ID = process.env.ROLE_OFFICER || '1287157880167989329';

// Guard roles: players who already went through verification.
export const VERIFIED_ROLE_ID = process.env.ROLE_VERIFIED || '1287146572219682888';
export const ALLIED_ROLE_ID = process.env.ROLE_ALLIED || '1289709436180369439';

// True when the clicker already holds the given role.
export function hasRole(interaction, roleId) {
  return Boolean(interaction.member?.roles?.cache?.has(roleId));
}

// Turn a username into a safe thread-name suffix: recruit-<slug> / ally-<slug>.
function threadSlug(username) {
  const slug = String(username || 'player')
    .toLowerCase()
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'player';
}

/**
 * Open (or reuse) the private verification thread for a button click, add the
 * clicker, and post the thread opener.
 *
 * Only the clicker needs to be added explicitly (the bot creates the thread).
 * NCOs and Officers are covered by Manage Threads in the target channels, so
 * the role mentions in the opener reach them without per-member adds.
 */
export async function openRecruitThread(interaction, { prefix, welcome }) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const channel = interaction.channel;
    const guild = interaction.guild;

    // Name the thread after the member's server name (nickname when set),
    // falling back to the plain Discord username.
    const displayName = interaction.member?.displayName ?? interaction.user.username;
    const name = `${prefix}-${threadSlug(displayName)}`;

    // Reuse the clicker's still-open thread instead of stacking new ones.
    let thread = null;
    try {
      const { threads } = await channel.threads.fetchActive();
      thread = threads.find(t => t.name === name && !t.archived) ?? null;
    } catch (err) {
      console.error('[recruit] could not list active threads:', err.message);
    }

    let created = false;
    if (!thread) {
      thread = await channel.threads.create({
        name,
        type: ChannelType.PrivateThread,
        autoArchiveDuration: 1440, // 24h — long enough for staff to respond
        invitable: true, // let NCOs/Officers pull others in
      });
      created = true;
      console.log(`[recruit] opened private thread #${thread.name} (${thread.id}) for ${interaction.user.tag}`);
    }

    // The bot creates the thread, so the clicker has to be pulled in manually.
    await thread.members.add(interaction.user.id).catch(err =>
      console.error(`[recruit] could not add ${interaction.user.id} to thread:`, err.message),
    );

    if (created) {
      // Staff can finish the verification with this; it archives the thread
      // to the log channel before it is deleted (see utils/verifyArchive.js).
      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('verify_close')
          .setLabel('Close & Archive')
          .setEmoji('🧹')
          .setStyle(ButtonStyle.Secondary),
      );
      await thread.send({ content: welcome(interaction.user.id), components: [closeRow] }).catch(err =>
        console.error('[recruit] could not post thread opener:', err.message),
      );
    }

    const link = `https://discord.com/channels/${guild.id}/${thread.id}`;
    await interaction.editReply({ content: `👇 Your thread is open: ${link}` });
    return thread;
  } catch (err) {
    console.error(`[recruit] could not open verification thread:`, err);
    await interaction
      .editReply({ content: '❌ Could not open a thread — please ping an NCO directly.' })
      .catch(() => {});
    return null;
  }
}
