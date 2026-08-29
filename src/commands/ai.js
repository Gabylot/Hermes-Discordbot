import { SlashCommandBuilder } from 'discord.js';
import { askAssistant } from '../utils/api.js';

// In-memory conversation history per Discord user id, so follow-up
// questions keep context. { [userId]: [{ role, content }] }
const conversations = new Map();
const MAX_HISTORY_MESSAGES = 10;

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

    // Discord messages are capped at 2000 chars.
    const MAX_DISCORD_LENGTH = 1990;
    const reply = result.reply.length > MAX_DISCORD_LENGTH ? `${result.reply.slice(0, MAX_DISCORD_LENGTH)}…` : result.reply;

    await interaction.editReply({ content: reply });
  },
};
