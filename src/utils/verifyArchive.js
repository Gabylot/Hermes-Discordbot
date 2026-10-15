import { EmbedBuilder, AttachmentBuilder } from 'discord.js';

// Finished verification threads are copied here before the thread is deleted.
const ARCHIVE_CHANNEL_ID = process.env.CHANNEL_VERIFY_ARCHIVE;

function threadKind(name) {
  if (name.startsWith('recruit-')) return { label: 'Recruit', color: 0x2ecc71 };
  if (name.startsWith('ally-')) return { label: 'Ally', color: 0x3498db };
  return { label: 'Verification', color: 0x95a5a6 };
}

// Oldest-first list of every message in the thread (paginates past 100).
async function collectMessages(thread) {
  const out = [];
  let before;
  for (;;) {
    const batch = await thread.messages.fetch(before ? { limit: 100, before } : { limit: 100 });
    const arr = [...batch.values()]; // newest first
    if (arr.length === 0) break;
    out.push(...arr);
    before = arr[arr.length - 1].id;
    if (arr.length < 100) break;
  }
  // Pages arrive newest-first; reversing yields oldest-first.
  return out.reverse();
}

function transcriptOf(messages, guild) {
  return messages
    .map((m) => {
      const time = m.createdAt.toISOString().replace('T', ' ').slice(0, 16);
      let body = m.content || '';
      for (const a of m.attachments.values()) body += (body ? ' ' : '') + `[attachment: ${a.url}]`;
      for (const e of m.embeds) body += (body ? ' ' : '') + `[embed: ${e.title || e.url || 'untitled'}]`;
      return `[${time}] ${displayNameOf(m, guild)}: ${body}`;
    })
    .join('\n');
}

// Pull every message author we don't have cached yet (one batched REST call),
// so their server nicknames can be shown in the transcript. Silently tolerant:
// authors that can't be fetched (e.g. left the guild) use the fallback chain.
async function ensureMembers(messages, guild) {
  if (!guild) return;
  const missing = [
    ...new Set(messages.map((m) => m.author?.id).filter((id) => id && !guild.members.cache.has(id))),
  ];
  if (missing.length === 0) return;
  try {
    await guild.members.fetch({ user: missing.slice(0, 100) });
  } catch (err) {
    console.warn('[archive] batch member fetch failed, using fallbacks:', err.message);
  }
}

// Prefer the author's server nickname in the thread's guild, then their
// global display name, then the plain username — never the old tag.
function displayNameOf(message, guild) {
  const member =
    message.member ?? (guild && message.author ? guild.members.cache.get(message.author.id) : null);
  if (member?.displayName) return member.displayName;
  if (message.author?.globalName) return message.author.globalName;
  return message.author?.username ?? message.author?.tag ?? 'unknown';
}

/**
 * Copy a finished verification thread into the archive channel.
 * Returns true when the archive post succeeded — callers should only delete
 * the thread after a successful archive so no history is ever lost.
 *
 * `note` is an optional extra header line (e.g. ghost threads closed because
 * the recruit left the server).
 */
export async function archiveVerificationThread(thread, closedBy, { note } = {}) {
  try {
    if (!ARCHIVE_CHANNEL_ID) {
      console.error('[archive] CHANNEL_VERIFY_ARCHIVE is not set');
      return false;
    }
    const channel =
      thread.client.channels.cache.get(ARCHIVE_CHANNEL_ID) ??
      (await thread.client.channels.fetch(ARCHIVE_CHANNEL_ID).catch(() => null));
    if (!channel) {
      console.error('[archive] archive channel not found:', ARCHIVE_CHANNEL_ID);
      return false;
    }

    const messages = await collectMessages(thread);
    await ensureMembers(messages, thread.guild);
    const kind = threadKind(thread.name);

    // The opener greets the clicker — their mention in the oldest message.
    const clicker = messages[0]?.mentions?.users?.first?.() ?? null;
    const clickerText = clicker
      ? `<@${clicker.id}>`
      : (thread.name.split('-').slice(1).join('-') || 'unknown');

    const header = [
      `**Thread:** ${thread.name}`,
      `**Opened by:** ${clickerText} · <t:${Math.floor(thread.createdTimestamp / 1000)}:F>`,
      `**Closed by:** <@${closedBy.id}> · <t:${Math.floor(Date.now() / 1000)}:F>`,
      `**Messages:** ${messages.length}`,
      ...(note ? [note] : []),
    ].join('\n');

    const transcript = messages.length ? transcriptOf(messages, thread.guild) : '(no messages)';
    const embed = new EmbedBuilder()
      .setTitle(`${kind.label} verification closed`)
      .setDescription(header)
      .setColor(kind.color)
      .setFooter({ text: thread.parent ? `From #${thread.parent.name}` : 'Verification' });

    const payload = { embeds: [embed] };
    if (header.length + transcript.length + 6 <= 4096) {
      // Short thread — show the transcript inline.
      embed.setDescription(`${header}\n\n\`\`\`\n${transcript}\n\`\`\``);
    } else {
      // Long thread — attach the full transcript as a text file.
      payload.files = [new AttachmentBuilder(Buffer.from(transcript, 'utf8'), { name: `${thread.name}.txt` })];
    }

    await channel.send(payload);
    console.log(`[archive] ${thread.name} archived (${messages.length} messages) by ${closedBy.tag}`);
    return true;
  } catch (err) {
    console.error('[archive] failed to archive thread:', err);
    return false;
  }
}
