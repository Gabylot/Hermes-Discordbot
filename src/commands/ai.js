import { SlashCommandBuilder } from 'discord.js';
import { askAssistant } from '../utils/api.js';

// In-memory conversation history per Discord user id, so follow-up
// questions keep context. { [userId]: [{ role, content }] }
const conversations = new Map();
const MAX_HISTORY_MESSAGES = 10;

// Discord messages are capped at 2000 chars; stay a little under for safety.
const MAX_DISCORD_LENGTH = 1900;

/**
 * Split a long reply into several messages, preferring paragraph, then line,
 * then sentence, then word boundaries so nothing is cut mid-word where avoidable.
 */
function splitForDiscord(text, max = MAX_DISCORD_LENGTH) {
  if (text.length <= max) return [text];

  const parts = [];
  let rest = text;

  while (rest.length > max) {
    const window = rest.slice(0, max + 1);
    // Cut at the last blank line in the window (paragraph break).
    let cut = window.lastIndexOf('\n\n');
    // Then the last single newline.
    if (cut < max * 0.5) cut = window.lastIndexOf('\n');
    // Then the last sentence end.
    if (cut < max * 0.5) cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '));
    // Then the last space. This is the floor: a single unbroken 2000-char token
    // would still be cut here, but nothing above it ever is.
    if (cut < max * 0.5) cut = window.lastIndexOf(' ');

    if (cut <= 0) {
      // No boundary anywhere (e.g. one giant code block): hard split.
      parts.push(rest.slice(0, max));
      rest = rest.slice(max);
      continue;
    }

    // Include the whitespace that ends the line/sentence, then trim the next chunk.
    let end = cut + (rest[cut] === '\n' ? 2 : 1);
    parts.push(rest.slice(0, end).trimEnd());
    rest = rest.slice(end).replace(/^\n+/, '');
  }

  if (rest.trim()) parts.push(rest.trimEnd());
  return parts.length ? parts : [text];
}

export default {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Ask the Hermes logistics assistant')
    .addStringOption(option =>
      option
        .setName('question')
        .setDescription('Your question, e.g. "which city needs bmats?" or "where can I find 200 hEmats?"')
        .setRequired(true),
    )
    .addBooleanOption(option =>
      option
        .setName('reset')
        .setDescription('Forget the conversation history before answering'),
    ),
  async execute(interaction) {
    const question = interaction.options.getString('question', true);
    const reset = interaction.options.getBoolean('reset') ?? false;
    const userId = interaction.user.id;

    if (reset) {
      conversations.delete(userId);
    }

    // The answer can take a while (LLM + tool calls) — defer with editing allowed.
    await interaction.deferReply();

    const history = (conversations.get(userId) ?? []).slice(-MAX_HISTORY_MESSAGES);

    let result;
    try {
      result = await askAssistant(userId, question, history);
    } catch (err) {
      const status = err?.response?.status;
      const message = err?.response?.data?.error;

      if (status === 429) {
        await interaction.editReply(`⏳ ${message ?? 'Rate limited. Please try again later.'}`);
        return;
      }
      if (status === 503) {
        await interaction.editReply(`🛠️ ${message ?? 'The assistant service is unavailable right now.'}`);
        return;
      }

      console.error('[ai] failed to ask assistant:', err.message);
      await interaction.editReply('❌ Could not reach the assistant service.');
      return;
    }

    const historyForNext = [
      ...history,
      { role: 'user', content: question },
      { role: 'assistant', content: result.reply },
    ];
    conversations.set(userId, historyForNext.slice(-MAX_HISTORY_MESSAGES));

    // Long answers become several messages rather than being cut off silently.
    const parts = splitForDiscord(result.reply);

    await interaction.editReply({ content: parts[0] });

    // Discord allows a burst of 2 messages per ~5s before rate limiting, and the
    // client library queues beyond that, but pace them anyway so a long answer
    // does not look like a burst of spam.
    for (let i = 1; i < parts.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 700));
      await interaction.followUp({ content: parts[i] });
    }
  },
};
