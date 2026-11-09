#!/usr/bin/env node
// Measures time from `visivo init` to a rendered sample dashboard in a browser.
//
// Usage (from visivo/):
//   node scripts/first-run-timing.mjs --visivo .venv/bin/visivo [--port 8051]
//        [--example ev-sales] [--runs 3] [--keep]
//
// Each run uses a fresh scratch HOME (telemetry off) and a fresh project dir,
// runs `visivo init` inside it with BROWSER=true (no real browser opens),
// opens the URL the CLI hands the browser, and takes
// the fastest click path a new user could take until a dashboard chart has
// drawn data. Click time is counted as zero: the number is machine time only.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '..', 'viewer', 'package.json'));
const { chromium } = require('playwright');

function parseArgs(argv) {
  const args = { port: 8051, runs: 1, example: null, keep: false, timeout: 180 };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (key === 'keep') args.keep = true;
    else args[key] = argv[++i];
  }
  if (!args.visivo) throw new Error('--visivo <path to the visivo executable> is required');
  args.visivo = resolve(args.visivo);
  args.port = Number(args.port);
  args.runs = Number(args.runs);
  args.timeout = Number(args.timeout);
  return args;
}

const CLICK_PATH = [
  'onb-sample-ev-sales',
  'onb-data-sample',
  'onb-concept-continue',
  'onb-role-continue',
  'onb-role-other',
  'onb-welcome-continue',
  'onb-cloud-later',
];

async function dashboardRendered(page) {
  return page
    .evaluate(() => {
    if (!/^\/project\/[^/]+/.test(window.location.pathname)) return false;
    const plots = document.querySelectorAll('.js-plotly-plot');
    return Array.from(plots).some(
      p => p.querySelector('g.trace, g.indicator, g.barlayer path, g.scatterlayer path')
    );
    })
    .catch(() => false);
}

async function clickable(page, id) {
  try {
    const el = page.getByTestId(id).first();
    return (await el.count()) > 0 && (await el.isVisible()) && (await el.isEnabled());
  } catch {
    return false;
  }
}

async function measureOnce(args, runIdx) {
  const home = mkdtempSync(join(tmpdir(), 'visivo-first-run-home-'));
  const work = mkdtempSync(join(tmpdir(), 'visivo-first-run-proj-'));
  const projectDir = join(work, 'my-project');
  mkdirSync(projectDir);
  const env = { ...process.env, HOME: home, VISIVO_TELEMETRY_DISABLED: 'true', BROWSER: 'true' };
  delete env.VISIVO_TELEMETRY_FORCE;
  spawnSync(args.visivo, ['telemetry', 'off'], { env, cwd: work });

  const initArgs = ['init', '--port', String(args.port)];
  if (args.example) initArgs.push('--example', args.example);

  const marks = {};
  const t0 = Date.now();
  const child = spawn(args.visivo, initArgs, { env, cwd: projectDir, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  const urlReady = new Promise((resolveUrl, reject) => {
    const onData = buf => {
      log += buf.toString();
      const m = log.match(/(?:Opening|View your project at:?)\s+(http:\/\/\S+)/);
      if (m) resolveUrl(m[1]);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', code => reject(new Error(`visivo init exited ${code}\n${log}`)));
  });

  const deadline = t0 + args.timeout * 1000;
  let browser;
  const result = { run: runIdx, example: args.example, clicks: [], rendered: false };
  try {
    let timer;
    const announced = await Promise.race([
      urlReady,
      new Promise((_, rej) => {
        timer = setTimeout(
          () => rej(new Error('server never announced a URL')),
          args.timeout * 1000
        );
      }),
    ]).finally(() => clearTimeout(timer));
    marks.server_ready_s = (Date.now() - t0) / 1000;
    const openArg = log.match(/Opening (http:\/\/\S+)/);
    const openUrl = openArg ? openArg[1] : `${announced.replace(/\/$/, '')}/?onboarding=1`;
    result.opened_url = openUrl;

    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(openUrl);
    marks.page_loaded_s = (Date.now() - t0) / 1000;

    while (Date.now() < deadline) {
      if (await dashboardRendered(page)) {
        result.rendered = true;
        break;
      }
      let clicked = false;
      for (const id of CLICK_PATH) {
        if (await clickable(page, id)) {
          await page.getByTestId(id).first().click({ timeout: 2000 }).catch(() => {});
          result.clicks.push(id);
          clicked = true;
          break;
        }
      }
      if (!clicked && /^\/project\/?$/.test(new URL(page.url()).pathname)) {
        const link = page.locator('a[href^="/project/"]').first();
        if (await link.count().catch(() => 0)) {
          await link.click().catch(() => {});
          result.clicks.push('dashboard-list-link');
          clicked = true;
        }
      }
      await page.waitForTimeout(clicked ? 150 : 250);
    }
    result.final_url = page.url();
    result.total_s = (Date.now() - t0) / 1000;
    Object.assign(result, marks);
  } catch (err) {
    result.error = err.message.split('\n')[0];
  } finally {
    if (browser) await browser.close();
    child.kill('SIGINT');
    await new Promise(r => setTimeout(r, 500));
    child.kill('SIGKILL');
    if (!args.keep) {
      rmSync(home, { recursive: true, force: true });
      rmSync(work, { recursive: true, force: true });
    }
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const results = [];
for (let i = 1; i <= args.runs; i++) {
  // eslint-disable-next-line no-await-in-loop
  const r = await measureOnce(args, i);
  results.push(r);
  console.log(JSON.stringify(r));
}
const done = results.filter(r => r.rendered).map(r => r.total_s).sort((a, b) => a - b);
console.log(
  JSON.stringify({
    summary: true,
    runs: results.length,
    rendered: done.length,
    median_s: done.length ? done[Math.floor(done.length / 2)] : null,
    clicks: results[0]?.clicks.length ?? null,
  })
);
process.exit(0);
