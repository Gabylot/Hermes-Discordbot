import { SlashCommandBuilder } from 'discord.js';
import { askAssistant } from '../utils/api.js';
import { renderRoute, formatDistance, formatDuration } from '../utils/routeImage.js';

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

/**
 * Turn the assistant's route request into a map image, or explain why not.
 *
 * The assistant decides *whether* a map helps (by calling the route tool); we
 * only decide whether we can actually draw it. It never returns an estimate
 * when the real route is unavailable - a wrong number on a delivery plan is
 * worse than an honest gap.
 */
async function buildRouteAttachment(route) {
  const result = await renderRoute(route.origin, route.destination, route.vehicle ?? 'truck');

  if (!result.found) {
    if (result.reason === 'no_road_route') {
      return {
        content:
          `*No road route from ${route.origin} to ${route.destination} - they are on separate landmasses, ` +
          'so this leg needs a boat or a plane.*',
      };
    }

    // Renderer trouble (cold start, LogiWaze rebuild, network). Say so quietly
    // rather than pretending, but do not make the user think the answer failed.
    console.warn(`[route] render failed: ${result.reason} ${result.error ?? ''}`);

    return { content: `*Could not draw the map for ${route.origin} → ${route.destination}.*` };
  }

  // `figures` is what lets the assistant quote real numbers instead of
  // apologising for their absence; `content` is the human-readable fallback.
  const figures = {
    distance: formatDistance(result.distanceMeters),
    duration: formatDuration(result.travelSeconds),
  };

  // When an endpoint was a whole region, the renderer had to pick one town in it
  // to measure from. Carry the label through so the caption is honest about
  // that rather than implying the whole region was covered.
  const originLabel = route.origin_label ?? route.origin;
  const destLabel = route.destination_label ?? route.destination;

  return {
    figures,
    origin: route.origin,
    destination: route.destination,
    originLabel,
    destLabel,
    content:
      `**${originLabel} → ${destLabel}**\n` +
      `${figures.distance} by road · about ${figures.duration}`,
    files: [{ attachment: Buffer.from(result.image), name: 'route.png' }],
  };
}

/**
 * Ask the assistant, and when it wants a route map, measure it *first* and hand
 * the real figures back for a second pass.
 *
 * The ordering problem this solves: a driving distance cannot be known until a
 * browser has measured the road network, but the browser lives in the bot
 * rather than in Hermes. Answering first and rendering after left the model
 * saying "the distance wasn't returned" right next to a map that plainly
 * showed the route - honest, but useless to the driver who asked.
 *
 * So when a route is requested we measure it (~10s) and re-ask with the numbers
 * in hand, letting the model write one normal answer that includes them. The
 * draft is kept as history so the second pass keeps its context and only has to
 * add the figures.
 *
 * If the route cannot be measured at all we keep the original answer, which
 * already explains why.
 */
async function askWithRoute(userId, question, history) {
  const first = await askAssistant(userId, question, history);

  if (first.route?.type !== 'route_map') {
    return { ...first, image: null, routeNote: null };
  }

  const attachment = await buildRouteAttachment(first.route);

  // No figures (island crossing, or the renderer is down): keep the draft and
  // let the note explain the situation.
  if (!attachment.figures) {
    return { ...first, image: null, routeNote: attachment.content };
  }

  const followUp =
    `The map has now been measured. The real driving route from ` +
    `${attachment.origin} to ${attachment.destination} is ${attachment.figures.distance} ` +
    `by road and takes about ${attachment.figures.duration} in a truck. ` +
    `(For the map, the player asked for: ${attachment.originLabel} → ${attachment.destLabel}.` +
    ` If that says "region, measured from ...", repeat that caveat in your answer - the ` +
    `distance is for that one town, not for the whole region.)\n\n` +
    `Answer the original question again, this time including those exact figures. ` +
    `State the distance and drive time directly. Do not say they are unknown or ` +
    `unavailable, and do not promise that a map will be attached - the map is ` +
    `already going out with this message.`;

  try {
    const second = await askAssistant(userId, followUp, [
      ...history,
      { role: 'user', content: question },
      { role: 'assistant', content: first.reply },
    ]);

    return {
      ...second,
      image: attachment.files?.[0]?.attachment ?? null,
      routeNote: null,
    };
  } catch (err) {
    // A failed second pass must not lose the answer: keep the draft and show
    // the measured figures underneath it.
    console.error('[ai] route second pass failed:', err.message);

    return {
      ...first,
      image: attachment.files?.[0]?.attachment ?? null,
      routeNote: attachment.content,
    };
  }
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
      // askWithRoute measures any requested map *before* the final answer is
      // written, so the assistant can quote the real distance and drive time
      // instead of apologising for not having them.
      result = await askWithRoute(userId, question, history);
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

    // Attach the measured map. By this point the answer already quotes the real
    // distance, so the image is confirmation rather than the only source.
    if (result.image) {
      await interaction.followUp({ files: [{ attachment: result.image, name: 'route.png' }] });
    } else if (result.routeNote) {
      // No map to send (island crossing, or the renderer is down): add the note
      // to the answer. editReply only touches the first message, so this is only
      // safe while the answer is still a single message.
      if (parts.length === 1) {
        await interaction.editReply({ content: `${parts[0]}\n${result.routeNote}` });
      } else {
        await interaction.followUp({ content: result.routeNote });
      }
    }
  },
};
