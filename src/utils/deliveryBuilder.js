import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import { getCities, buildDeliveryJob } from './api.js';
import { buildDeliveryTicketEmbed } from '../embeds/index.js';
import { renderRoute, formatDistance, formatDuration } from './routeImage.js';

// ── In-memory sessions for the /delivery command ─────────────────────────────
// Keyed by the Discord message id of the ephemeral config message.
// { userId, productionCities, frontlineCities, productionCityId, frontlineCityId, containers }
export const deliverySessions = new Map();

/**
 * Fetch cities and split them into the groups the /delivery flow needs.
 *
 * Three destinations, because supplies can usefully go somewhere that is
 * neither an MPF nor a front:
 *   - production: where stock comes from
 *   - frontline:  where the fighting is
 *   - midline:    everything else with a real storage - refuel stops, rear
 *                 depots, forward filler. A driver often needs to route
 *                 through one of these even though it is not a "front" base.
 *
 * Uses the same shape the existing delivery flow relies on (id, name,
 * isProduction, isFront, isMidline).
 */
export async function loadCities() {
  const cities = await getCities();
  const production = cities.filter(c => c.isProduction);
  const frontline = cities.filter(c => c.isFront);
  // Fall back for older backends that do not send isMidline yet.
  const midline = cities.filter(
    c => c.isMidline ?? (!c.isProduction && !c.isFront),
  );
  return { production, frontline, midline };
}

function cityMenu(cities, customId, placeholder, selectedId, emoji) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(1)
    .setMaxValues(1)
    .setOptions(
      cities.map(c => {
        const opt = new StringSelectMenuOptionBuilder()
          .setLabel(c.name)
          .setValue(String(c.id));
        // A null emoji means "use the per-city one" (frontline vs midline);
        // otherwise the caller supplied a single emoji for the whole menu.
        const mark = emoji ?? (c.__midline ? '⚪' : '🏙️');
        if (mark) opt.setEmoji(mark);
        if (selectedId && String(c.id) === selectedId) opt.setDefault(true);
        return opt;
      }),
    );
  return select;
}

/**
 * Is the user done? A session is "ready to build" once a production city and a
 * (different) frontline city are both chosen AND a container count is entered.
 */
export function isReady(session) {
  return (
    session.productionCityId &&
    session.frontlineCityId &&
    session.containers &&
    session.productionCityId !== session.frontlineCityId
  );
}

/**
 * Build the interactive component rows for the /delivery config message.
 * - Two city select menus (production + frontline).
 * - A single action button that adapts to the current state:
 *     closed (Choose cities first) → "Set Container Count" → "Build Transport List".
 *   The count itself is entered as free text via a modal (not preset options).
 */
export function renderConfig(session) {
  const citiesChosen =
    session.productionCityId &&
    session.frontlineCityId &&
    session.productionCityId !== session.frontlineCityId;

  const prodSelect = cityMenu(
    session.productionCities,
    'delivery_pick_production',
    '🏭 Production city',
    session.productionCityId,
    '🏭',
  );
  // Frontline and midline are both destinations, so they share one menu. The
  // emoji distinguishes them so a driver can see at a glance which kind of
  // base they are routing to.
  const destinationCities = (session.destinationCities ?? session.frontlineCities ?? []).map(c => ({
    ...c,
    __midline: Boolean(c.isMidline ?? (!c.isProduction && !c.isFront)),
  }));

  const frontSelect = cityMenu(
    destinationCities,
    'delivery_pick_frontline',
    '🏙️ Destination city (frontline / midline)',
    session.frontlineCityId,
    null,
  );

  let label, emoji, style, disabled;
  if (!citiesChosen) {
    label = 'Choose cities first';
    emoji = '🔒';
    style = ButtonStyle.Secondary;
    disabled = true;
  } else if (!session.containers) {
    label = 'Set Container Count';
    emoji = '✏️';
    style = ButtonStyle.Primary;
    disabled = false;
  } else {
    label = 'Build Transport List';
    emoji = '🚛';
    style = ButtonStyle.Success;
    disabled = false;
  }

  const actionBtn = new ButtonBuilder()
    .setCustomId('delivery_build')
    .setLabel(label)
    .setEmoji(emoji)
    .setStyle(style)
    .setDisabled(disabled);

    const pickerProdRow = new ActionRowBuilder().addComponents(prodSelect);
  const pickerFrontRow = new ActionRowBuilder().addComponents(frontSelect);
  const btnRow = new ActionRowBuilder().addComponents(actionBtn);
  // Each select menu must live in its own Action Row — Discord does not allow
  // two select menus (or a mix of buttons + selects) in the same row.
  return [pickerProdRow, pickerFrontRow, btnRow];
}

/**
 * Draw the road route for a delivery and post it into its thread.
 *
 * A driver picking up a delivery list wants to know the drive before they
 * commit, so the map goes right under the list. Rendering takes ~10s (a real
 * browser measuring the real road network), which is why it happens after the
 * list is already posted rather than before it.
 *
 * Never blocks or fails the delivery: if the renderer is down, or the two
 * cities are on separate landmasses, we post a short note and move on. A
 * missing map must not cost someone their transport list.
 */
async function postRouteToThread(thread, origin, destination) {
  try {
    const result = await renderRoute(origin, destination, 'truck');

    if (!result.found) {
      if (result.reason === 'no_road_route') {
        await thread.send(
          `🚢 **No road from ${origin} to ${destination}** — they are on separate ` +
            'landmasses, so this delivery needs a boat or a plane.',
        );
      } else {
        console.warn(`[delivery] route render failed: ${result.reason} ${result.error ?? ''}`);
        await thread.send(`*Could not draw the route map for ${origin} → ${destination}.*`);
      }

      return;
    }

    await thread.send({
      content:
        `🗺️ **Route: ${origin} → ${destination}**\n` +
        `${formatDistance(result.distanceMeters)} by road · about ` +
        `${formatDuration(result.travelSeconds)} with a truck`,
      files: [{ attachment: Buffer.from(result.image), name: 'route.png' }],
    });
  } catch (err) {
    console.error('[delivery] route post failed:', err.message);
  }
}

/**
 * Build the delivery contract via the backend and open a PRIVATE THREAD with the
 * resulting transport list (built via buildDeliveryTicketEmbed, which carries
 * the done/cancel buttons). The ephemeral config message is replaced with a
 * short confirmation linking to the thread.
 *
 * Called once both cities and the free-text container count are known.
 */
export async function buildAndShow(interaction, session) {
  let job;
  try {
    job = await buildDeliveryJob(
      interaction.user.id,
      session.productionCityId,
      session.frontlineCityId,
      session.containers,
      false,
    );
  } catch (err) {
    console.error('[delivery] build failed:', err?.response?.status, err?.message);
    await interaction.editReply({
      content:
        '❌ Could not build your delivery. The backend may have nothing to ship right now — try again later.',
      embeds: [],
      components: [],
    });
    return false;
  }

  // Components V2 transport list (container + done/cancel buttons).
  const payload = buildDeliveryTicketEmbed(job, interaction.user.id);

  try {
    // Open a private thread (mirrors the regular delivery-request UX) and post
    // the transport list there.
    const thread = await interaction.channel.threads.create({
      name: `delivery-${interaction.user.username || 'player'}-${job.contract_id}`,
      autoArchiveDuration: 1440,
      type: 12, // PRIVATE_THREAD
      invitable: false,
    });
    await thread.members.add(interaction.user.id);
    await thread.send(payload);

    // Confirm in the ephemeral config message first, so the user is unblocked
    // immediately rather than waiting ~10s on the browser for the map.
    await interaction.editReply({
      content:
        `✅ **Delivery #${job.contract_id}** planned — ${job.container_count} container(s), ` +
        `${job.production_city} → ${job.frontline_city}.\n` +
        `I opened a private thread for you: ${thread}`,
      embeds: [],
      components: [],
    });

    // Then drop the route map into the thread.
    await postRouteToThread(thread, job.production_city, job.frontline_city);
  } catch (err) {
    console.error('[delivery] thread creation failed, falling back to inline list:', err.message);
    // PATCH-less fallback: replace with the pure Components V2 transport list
    // (clear the classic embed — V2 cannot carry embeds), then note the problem
    // via a follow-up.
    await interaction.editReply({
      embeds: [],
      components: payload.components,
      flags: payload.flags,
    });
    await interaction.followUp({
      content: '⚠️ Couldn\'t open a thread, so your transport list is shown above.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const adminChannel = interaction.client.channels.cache.get(process.env.CHANNEL_ADMIN_LOG);
  if (adminChannel) {
    await adminChannel
      .send(
        `🚛 Delivery requested by <@${interaction.user.id}> — ` +
        `${job.production_city} → ${job.frontline_city}, ` +
        `${job.container_count} container(s)`,
      )
      .catch(() => {});
  }

  console.log(
    `[delivery] job for ${interaction.user.id}: ` +
    `${job.production_city} → ${job.frontline_city} (${job.container_count} container(s))`,
  );
  return true;
}

