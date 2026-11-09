/**
 * End-to-end test for the empty-repo first run.
 *
 * What this exercises:
 *   1. visivo serve runs in a directory with no project.visivo.yml at all.
 *   2. The user lands on the /onboarding start screen: sample tiles first,
 *      then "connect your own data", "start empty" and the concept tour.
 *   3. One click on a sample writes it into the folder, builds it, and opens
 *      its dashboard with data drawn, with no Run click and no checklist on
 *      top of the charts.
 *
 * The runner spawns a one-off sandbox pointed at a fresh tmp directory.
 * The sandbox script (visivo/scripts/sandbox.sh) honors
 * VISIVO_SANDBOX_PROJECT_DIR + ports + a name suffix so this can run
 * alongside the standard sandbox.
 */
import { test, expect } from '@playwright/test';
import { execSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const FRONTEND_PORT = process.env.ONB_E2E_FRONTEND_PORT
  ? Number(process.env.ONB_E2E_FRONTEND_PORT)
  : 3002;
const BACKEND_PORT = process.env.ONB_E2E_BACKEND_PORT
  ? Number(process.env.ONB_E2E_BACKEND_PORT)
  : 8002;
const SANDBOX_NAME = 'onb-empty';
const REPO_ROOT = resolve(process.cwd(), '..');
const SANDBOX_SCRIPT = join(REPO_ROOT, 'scripts', 'sandbox.sh');

let projectDir;

function envFor(extra = {}) {
  return {
    ...process.env,
    VISIVO_SANDBOX_FRONTEND_PORT: String(FRONTEND_PORT),
    VISIVO_SANDBOX_BACKEND_PORT: String(BACKEND_PORT),
    VISIVO_SANDBOX_PROJECT_DIR: projectDir,
    VISIVO_SANDBOX_NAME: SANDBOX_NAME,
    ...extra,
  };
}

async function waitForServer(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  /* eslint-disable no-await-in-loop */
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 200) return true;
    } catch {
      /* server not ready yet */
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  /* eslint-enable no-await-in-loop */
  throw new Error(`Server at ${url} never became ready`);
}

test.describe.configure({ mode: 'serial' });

test.describe('Empty-repo onboarding flow', () => {
  test.beforeAll(async () => {
    projectDir = mkdtempSync(join(tmpdir(), 'visivo-empty-onb-'));
    const child = spawn('bash', [SANDBOX_SCRIPT, 'start'], {
      env: envFor(),
      stdio: 'inherit',
    });
    await new Promise((resolveP, rejectP) => {
      child.on('exit', code => (code === 0 ? resolveP() : rejectP(new Error(`sandbox start exit ${code}`))));
    });
    await waitForServer(`http://localhost:${FRONTEND_PORT}`);
    await waitForServer(`http://localhost:${BACKEND_PORT}/api/project/`);
  });

  test.afterAll(() => {
    try {
      execSync(`bash ${SANDBOX_SCRIPT} stop`, { env: envFor(), stdio: 'inherit' });
    } catch {
      /* best-effort */
    }
    if (projectDir) rmSync(projectDir, { recursive: true, force: true });
  });

  test('serve boots without crash; backend reports a Quickstart project', async ({ request }) => {
    const res = await request.get(`http://localhost:${BACKEND_PORT}/api/project/`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body?.name).toBe('Quickstart Visivo');
    expect(body?.dashboard_count).toBe(0);
  });

  test('user lands on /onboarding from / when project is empty', async ({ page }) => {
    await page.goto(`http://localhost:${FRONTEND_PORT}`);
    await page.evaluate(() => {
      try {
        window.localStorage.removeItem('visivo.onboarding.v1');
      } catch {
        /* ignore */
      }
    });
    await page.goto(`http://localhost:${FRONTEND_PORT}`);
    await page.waitForURL(/\/onboarding(\?.*)?$/, { timeout: 10000 });
    await expect(page.getByTestId('onboarding-frame')).toBeVisible();
  });

  async function freshOnboarding(page) {
    await page.goto(`http://localhost:${FRONTEND_PORT}/onboarding`);
    await page.evaluate(() => {
      try {
        window.localStorage.removeItem('visivo.onboarding.v1');
      } catch {
        /* ignore */
      }
    });
    await page.goto(`http://localhost:${FRONTEND_PORT}/onboarding`);
    await expect(page.getByTestId('onb-step-start')).toBeVisible();
  }

  test('the start screen offers the samples and the concept tour', async ({ page }) => {
    await freshOnboarding(page);
    await expect(page.getByTestId('onb-sample-ev-sales')).toBeVisible();
    await page.getByTestId('onb-start-tour').click();
    await page.getByTestId('onb-role-software_engineer').click();
    await page.getByTestId('onb-role-continue').click();
    for (let i = 1; i <= 7; i++) {
      await expect(page.getByTestId(`onb-step-concept-${i}`)).toBeVisible();
      await page.getByTestId('onb-concept-continue').click();
    }
    await expect(page.getByTestId('onb-step-start')).toBeVisible();
  });

  test('connect your own data opens the source dialog from the start screen', async ({ page }) => {
    await freshOnboarding(page);
    await page.getByTestId('onb-data-connect').click();
    await expect(page.getByTestId('onb-source-modal')).toBeVisible();
    await expect(page.getByText('Add a Source')).toBeVisible();
  });

  test('start empty lands the user in the editor', async ({ page }) => {
    await freshOnboarding(page);
    await page.getByTestId('onb-start-empty').click();
    await page.waitForURL(/\/workspace\?view=project$|\/editor$/, { timeout: 10000 });
  });

  // Mutates the project directory, so it runs last.
  test('one click on a sample opens its dashboard with data drawn', async ({ page }) => {
    test.setTimeout(90000);
    await freshOnboarding(page);
    const started = Date.now();
    await page.getByTestId('onb-sample-ev-sales').click();
    await expect(page.getByTestId('onb-sample-loading')).toBeVisible();

    await page.waitForURL(/\/project\/EV%20Sales%20Overview$/, { timeout: 60000 });
    const plots = page.locator('.js-plotly-plot');
    await expect(plots.first()).toBeVisible({ timeout: 30000 });
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              Array.from(document.querySelectorAll('.js-plotly-plot')).filter(p =>
                p.querySelector('g.trace, g.indicator')
              ).length
          ),
        { timeout: 30000 }
      )
      .toBeGreaterThan(0);
    expect(Date.now() - started).toBeLessThan(60000);
    await expect(page.getByText(/No insight files found/i)).toHaveCount(0);

    const checklist = page.getByTestId('onboarding-checklist');
    await expect(checklist).toBeVisible();
    const box = await checklist.boundingBox();
    const viewport = page.viewportSize();
    expect(box.y + box.height).toBeGreaterThan(viewport.height - 40);

    const persisted = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem('visivo.onboarding.v1') || '{}')
    );
    expect(persisted).toMatchObject({ path: 'sample', sample: 'ev-sales' });
  });
});
