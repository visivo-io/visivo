/**
 * Fail if the built viewer fetches anything from outside its own origin.
 *
 * Every CDN fetch this project removed got in the same way: an import whose
 * remote default nobody noticed, in a bundle nobody inspected. `monaco-editor`
 * was a direct dependency for as long as the SQL editor existed, and the editor
 * was still re-downloaded from jsdelivr at runtime — so offline it sat in a
 * permanent loading state with no error. Nothing in the test suite could see
 * that, because nothing looked at the network.
 *
 * So this drives the real bundle in a real browser and asserts on the request
 * log. A host that must be remote goes in ALLOWED below, with a reason, which
 * makes adding one a visible decision rather than an accident.
 *
 * Usage: node scripts/offline-guard.mjs <base-url> [model-name]
 */
import { chromium } from 'playwright';

const [baseUrl, modelName = 'local_test_table'] = process.argv.slice(2);
if (!baseUrl) {
  console.error('Usage: node scripts/offline-guard.mjs <base-url> [model-name]');
  process.exit(2);
}

/**
 * Hosts that are legitimately remote. Each one is a dependency we cannot
 * bundle, not a default we failed to override.
 */
const ALLOWED = [
  // Map tiles, glyphs and sprites. A world basemap is tens of gigabytes, so
  // this is the one class of fetch that will always be remote. Charts say
  // "Map background unavailable" when it fails (VIS-1572) rather than drawing
  // an empty frame.
  'basemaps.cartocdn.com',
  'fonts.openmaptiles.org',
  'tiles.stadiamaps.com',
  'api.mapbox.com',
  'server.arcgisonline.com',
  'unpkg.com/maki',
  // Plotly fetches topojson for `scattergeo`/`choropleth` outlines at render
  // time. VIS-1571 would bundle it; until then the guard records the fetch
  // instead of blocking on the fix.
  'cdn.plot.ly',
  // Telemetry. Fire-and-forget, off for Visivo's own developers, and disabled
  // outright under CI by the serve-time flag — so it should not appear here at
  // all. Allowed so a telemetry change is never what breaks this test.
  'us.i.posthog.com',
  'app.posthog.com',
];

const origin = new URL(baseUrl).origin;
const external = new Map();

const isLocal = url =>
  url.startsWith(origin) ||
  url.startsWith('data:') ||
  url.startsWith('blob:') ||
  url.startsWith('about:');

const browser = await chromium.launch();
const page = await browser.newPage();

page.on('request', request => {
  const url = request.url();
  if (isLocal(url)) return;
  const allowed = ALLOWED.find(host => url.includes(host));
  if (allowed) return;
  const key = new URL(url).host;
  if (!external.has(key)) external.set(key, []);
  external.get(key).push(`${request.resourceType()} ${url.slice(0, 160)}`);
});

const base = baseUrl.replace(/\/$/, '');
const visited = [];

const visit = async (path, settle) => {
  const url = `${base}${path}`;
  console.log(`  visiting ${url}`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  if (settle) await settle();
  visited.push(path);
};

const failures = [];
try {
  // The page `visivo serve` returns. This is where the socket.io client used to
  // be pulled from cdnjs by an injected script tag (VIS-1569).
  await visit('/');

  // Mounts Monaco through the model edit form (VIS-1568). `.monaco-editor` is
  // the editor's own root class, so it only appears once Monaco itself has
  // loaded and rendered — which is exactly what a CDN fetch would be needed
  // for. A missing editor is a failure in its own right: it would mean the
  // guard saw no external request because nothing tried to load.
  await visit(`/editor/model/${modelName}`, async () => {
    await page
      .locator('.monaco-editor')
      .first()
      .waitFor({ state: 'visible', timeout: 45000 })
      .catch(() => {});
  });

  const editorMounted = (await page.locator('.monaco-editor').count()) > 0;
  if (!editorMounted) {
    failures.push(
      `The SQL editor never mounted at /editor/model/${modelName}, so this run proves ` +
        'nothing about how Monaco is loaded. Check the model name and the route.'
    );
  }

  if (external.size) {
    const detail = [...external.entries()]
      .map(([host, urls]) => `${host}\n        ${[...new Set(urls)].join('\n        ')}`)
      .join('\n      ');
    failures.push(`The viewer fetched from outside its origin:\n      ${detail}`);
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\nOffline guard FAILED:`);
  failures.forEach(f => console.error(`  - ${f}`));
  console.error(
    '\nIf the host is genuinely unavoidable, add it to ALLOWED in this file with a ' +
      'comment saying why. If it is not, serve the asset from the bundle instead.'
  );
  process.exit(1);
}

console.log(
  `\nOffline guard PASSED — ${visited.length} surfaces (${visited.join(', ')}) ` +
    'made no request outside the origin.'
);
