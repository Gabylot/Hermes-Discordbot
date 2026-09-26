/**
 * LogiWaze route rendering.
 *
 * The real Foxhole road network and its pathfinder only exist inside the
 * LogiWaze web app, so measuring a route means driving a real browser. This
 * module owns one long-lived headless Chrome and reuses it across calls so an
 * idle bot costs nothing.
 *
 * Note on latency: a route takes ~10s either way. Reusing the browser saves the
 * process launch (roughly 2s) but the dominant cost is reloading the page and
 * waiting for LogiWaze to ingest the road network for all 53 regions, and that
 * has to happen per request. Keeping one page open instead would cut it to
 * ~1s, but the map's ownership colouring is live war data that goes stale, and
 * a reused page also has to be reset between routes. Correctness wins here;
 * a stale map on a logistics route is worse than a slow one.
 *
 * Distances are never estimated. If the app cannot find a road route we report
 * that, because a straight line across the map is not a delivery plan.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Puppeteer is installed globally on this host, not as a local dependency, so
// resolve it by absolute path rather than adding it to package.json.
const PUPPETEER_PATH = '/usr/lib/node_modules/puppeteer';

// The deployed LogiWaze build. veli.team is the canonical host: it is
// APP_URL in Hermes .env, so asset('logiwaze/index.html') in the blade views
// resolves to exactly this URL. (vog.veli.team is a secondary vhost on the
// same docroot and also answers 200, but nothing in the app points at it.)
//
// The ?base= parameter is not optional: LogiWaze runs as a static page and
// cannot read Laravel config, so the iframe views pass this to tell it where
// the app root lives. Without it the page derives a base from its own URL and
// its /statsmap API calls miss.
const LOGIWAZE_URL =
  process.env.LOGIWAZE_URL ?? 'https://veli.team/logiwaze/index.html?base=https%3A%2F%2Fveli.team%2F';

// Upstream Foxhole API, used to fulfil the ownership requests the page makes so
// the map renders identically to production.
const FOXHOLE_API = 'https://war-service-live.foxholeservices.com/api/worldconquest';

// Generous: on first boot the page loads the whole road network.
const ROUTE_TIMEOUT_MS = 120_000;

const LAUNCH_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];

let browserPromise = null;

/**
 * Launch (or reuse) the shared browser.
 *
 * Launch errors are not cached: we clear the promise so the next call retries
 * instead of failing forever.
 */
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const puppeteer = require(PUPPETEER_PATH);

      return puppeteer.launch({ headless: 'new', args: LAUNCH_ARGS });
    })().catch((err) => {
      browserPromise = null;
      throw err;
    });
  }

  return browserPromise;
}

/** Close the shared browser. Safe to call when none is running. */
export async function shutdown() {
  if (!browserPromise) return;

  const pending = browserPromise;
  browserPromise = null;

  try {
    const browser = await pending;
    await browser.close();
  } catch {
    // Already gone; nothing to clean up.
  }
}

/**
 * Open a page with LogiWaze loaded and its map data pipeline satisfied.
 *
 * The page fetches map/ownership data from /statsmap/* on the Hermes host,
 * which needs a web session we do not have as a bot. Rather than fight that we
 * intercept those requests and answer them from the upstream Foxhole API
 * directly - same data, no auth - so ownership colouring matches production.
 */
async function openReadyPage(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  await page.setRequestInterception(true);

  page.on('request', async (request) => {
    const match = request.url().match(/\/statsmap\/api\/worldconquest\/(.*)$/);

    if (match) {
      try {
        const upstream = await fetch(`${FOXHOLE_API}/${match[1]}`);
        const body = await upstream.text();

        return request.respond({
          status: upstream.status,
          contentType: 'application/json',
          body,
        });
      } catch {
        return request.abort();
      }
    }

    // Tiles, fonts, workers go to their normal origin.
    try {
      return request.continue();
    } catch {
      // Page may have closed underneath us.
    }
  });

  await page.goto(LOGIWAZE_URL, { waitUntil: 'domcontentloaded', timeout: ROUTE_TIMEOUT_MS });

  // LogiWaze flips this once the road network and map data are in place.
  await page.waitForFunction(() => window.LogiWaze && window.LogiWaze.ready === true, {
    timeout: ROUTE_TIMEOUT_MS,
    polling: 500,
  });

  return page;
}

/**
 * Ask LogiWaze for the road distance between two towns.
 *
 * @returns {Promise<{found: boolean, distanceMeters?: number, travelSeconds?: number, error?: string}>}
 */
async function calculateRoute(page, origin, destination, vehicle) {
  return page.evaluate(
    (o, d, v) =>
      new Promise(resolve => {
        window.LogiWaze.calculateRoute(o, d, v, (err, r) => {
          if (err) {
            resolve({ found: false, error: String(err?.message ?? err) });
            return;
          }
          resolve({
            found: Boolean(r?.route_found),
            distanceMeters: r?.distance_meters ?? 0,
            travelSeconds: r?.travel_seconds ?? 0,
          });
        });
      }),
    origin,
    destination,
    vehicle,
  );
}

/**
 * Type the route into the visible routing inputs and screenshot the map.
 *
 * The distance comes from calculateRoute(); the polyline only exists once the
 * map has actually drawn the route, so the picture has to go through the same
 * UI a player would use.
 */
async function renderRouteImage(page, origin, destination) {
  await page.evaluate(
    (o, d) =>
      new Promise(resolve => {
        const inputs = document.querySelectorAll('.leaflet-routing-geocoder input');

        if (inputs.length < 2) {
          resolve(false);
          return;
        }

        // The geocoder is an async autocomplete: set the value, then click the
        // first suggestion that appears.
        const pick = (el, name) => {
          el.focus();
          el.value = name;
          el.dispatchEvent(new Event('input', { bubbles: true }));

          setTimeout(() => {
            const option = document.querySelector(
              '.leaflet-routing-geocoder-result-open tr[data-result-index] td',
            );
            if (option) {
              option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
              option.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            }
          }, 900);
        };

        pick(inputs[0], o);
        setTimeout(() => {
          pick(inputs[1], d);
          // Give Leaflet time to fetch tiles and draw the polyline.
          setTimeout(resolve, 4000);
        }, 1800);
      }),
    origin,
    destination,
  );

  return page.screenshot({ type: 'png' });
}

/**
 * Measure and draw a route.
 *
 * @param {string} origin       Town name as LogiWaze knows it.
 * @param {string} destination  Town name as LogiWaze knows it.
 * @param {string} [vehicle]    truck | jeep | flatbed | htd
 * @returns {Promise<{found: boolean, distanceMeters?: number, travelSeconds?: number,
 *   image?: Buffer, error?: string, reason?: string}>}
 */
export async function renderRoute(origin, destination, vehicle = 'truck') {
  let browser;

  try {
    browser = await getBrowser();
  } catch (err) {
    return { found: false, reason: 'renderer_unavailable', error: err.message };
  }

  let page;

  try {
    page = await openReadyPage(browser);
  } catch (err) {
    // A dead browser must not poison every later call.
    await shutdown();

    return { found: false, reason: 'renderer_failed', error: err.message };
  }

  try {
    const route = await calculateRoute(page, origin, destination, vehicle);

    if (!route.found) {
      return {
        found: false,
        reason: route.error ? 'unknown_place' : 'no_road_route',
        error: route.error,
      };
    }

    const image = await renderRouteImage(page, origin, destination);

    return {
      found: true,
      distanceMeters: route.distanceMeters,
      travelSeconds: route.travelSeconds,
      image,
    };
  } catch (err) {
    return { found: false, reason: 'render_error', error: err.message };
  } finally {
    // Reuse the browser, discard the page.
    await page?.close().catch(() => {});
  }
}

/** Human-readable distance, e.g. "2.2 km". */
export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return 'unknown distance';

  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

/** Human-readable drive time, e.g. "1 h 10 min" or "4 min". */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return 'unknown duration';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
