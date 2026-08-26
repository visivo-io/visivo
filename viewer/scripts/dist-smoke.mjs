/**
 * Smoke-test a served `visivo dist` bundle by actually loading a dashboard.
 *
 * `visivo dist` exits 0 even when the bundle it produced cannot render: the
 * command's job is to write files, and it has no idea whether the viewer can
 * read them. That gap let a real regression ship — `/api/project/` stopped
 * carrying the dereferenced project, resource lists moved to their own
 * endpoints, and dist was never given an equivalent for the dashboards list.
 * Every static build rendered "No dashboards found" while `visivo dist`
 * reported success.
 *
 * So this asserts on the rendered page, not on the files:
 *   - the dashboard route renders charts (not a loading or empty state)
 *   - no request for a `/data/*` artifact 404s
 *   - no console errors, including the URL-config throw that caused the above
 *
 * Usage: node scripts/dist-smoke.mjs <base-url> <dashboard-name>
 */
import { chromium } from 'playwright';

const [baseUrl, dashboardName] = process.argv.slice(2);
if (!baseUrl || !dashboardName) {
  console.error('Usage: node scripts/dist-smoke.mjs <base-url> <dashboard-name>');
  process.exit(2);
}

const IGNORED = [
  // A static bundle has no server to talk to; the viewer's socket client
  // retries and gives up. Not a bundle defect.
  'socket.io',
];
const ignorable = url => IGNORED.some(part => url.includes(part));

const browser = await chromium.launch();
const page = await browser.newPage();

const consoleErrors = [];
const badResponses = [];

page.on('console', m => {
  if (m.type() === 'error' && !ignorable(m.text())) consoleErrors.push(m.text());
});
page.on('pageerror', e => consoleErrors.push(`Uncaught: ${e.message}`));
page.on('response', r => {
  if (r.status() >= 400 && !ignorable(r.url())) badResponses.push(`${r.status()} ${r.url()}`);
});
page.on('requestfailed', r => {
  if (!ignorable(r.url())) badResponses.push(`FAILED ${r.url()}`);
});

const failures = [];
try {
  const url = `${baseUrl.replace(/\/$/, '')}/${dashboardName}`;
  console.log(`Loading ${url}`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

  // Charts mount asynchronously (parquet fetch + DuckDB), so wait for the
  // first one rather than sampling a fixed instant.
  await page
    .locator('.js-plotly-plot')
    .first()
    .waitFor({ state: 'attached', timeout: 45000 })
    .catch(() => {});

  const chartCount = await page.locator('.js-plotly-plot').count();
  const bodyText = (await page.locator('body').innerText()).trim();

  console.log(`Charts rendered: ${chartCount}`);

  if (chartCount === 0) failures.push('No charts rendered on the dashboard route.');
  // The exact strings the two known failure modes produce.
  if (/No dashboards found/i.test(bodyText)) {
    failures.push('Page shows "No dashboards found" — the bundle carries no dashboards list.');
  }
  if (/Loading dashboard/i.test(bodyText)) {
    failures.push('Page stuck on "Loading dashboard..." — the dashboard never resolved.');
  }
  if (badResponses.length) {
    failures.push(`Failed requests:\n    ${[...new Set(badResponses)].join('\n    ')}`);
  }
  if (consoleErrors.length) {
    failures.push(`Console errors:\n    ${[...new Set(consoleErrors)].join('\n    ')}`);
  }

  if (failures.length) {
    console.error(`\nDist smoke FAILED (${failures.length}):`);
    failures.forEach(f => console.error(`  - ${f}`));
    console.error(`\nPage text (first 300 chars):\n${bodyText.slice(0, 300)}`);
  } else {
    console.log('Dist smoke PASSED — dashboard rendered with no failed requests or errors.');
  }
} finally {
  await browser.close();
}

process.exit(failures.length ? 1 : 0);
