/**
 * Story: Compile Error Banner (Branch 2: feat/compile-error-visibility)
 *
 * Validates that when target/error.json indicates a compile failure, the
 * viewer renders a CompileErrorBanner at the top of the page above the
 * dashboard, and that the dashboard below still renders the last-known-good
 * project state.
 *
 * Approach: rather than corrupt the live project.visivo.yml (which would
 * race with hot-reload), we directly write to the backend's
 * `target/error.json`. The viewer's `loadError` route loader fetches this
 * file via `/api/error/`, so the banner reflects whatever shape lives on
 * disk. After the test we restore the file to `{}`.
 *
 * Precondition: Sandbox running on :3001/:8001 (or override-port via
 * PLAYWRIGHT_BASE_URL when running on a custom branch port like :3012).
 */

import { test, expect } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET_ERROR_JSON = join(
  __dirname,
  '..',
  '..',
  '..',
  'test-projects',
  'integration',
  'target',
  'error.json'
);

// The shared playwright.config.mjs hardcodes baseURL to :3001. When this spec
// is run against a per-branch sandbox (e.g. :3012), pass PLAYWRIGHT_BASE_URL
// explicitly and we will resolve URLs through it instead.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';

const COMPILE_FAILED_PAYLOAD = {
  compile_failed: true,
  summary: '4 validation errors in Project',
  errors: [
    {
      loc: ['insights', '0', 'props', 'type'],
      msg: 'Field required',
      type: 'missing',
      file: '/abs/path/to/project.visivo.yml',
      line: 22,
    },
    {
      loc: ['insights', '0'],
      msg: 'Value error, `model` is not a field on Insight. Reference your model from inside `props`.',
      type: 'value_error',
    },
    {
      loc: ['insights', '0'],
      msg: 'Value error, `type` belongs inside `props`, e.g. `props.type: bar`.',
      type: 'value_error',
    },
    {
      loc: ['charts', '0', 'layout'],
      msg: 'Value error, `layout.title` must be an object: `{text: "..."}`.',
      type: 'value_error',
    },
  ],
  compiled_at: '2026-04-29T17:30:00Z',
};

test.describe('Compile Error Banner', () => {
  // Tests in this file all mutate target/error.json on disk. Running them in
  // parallel would let one test's afterEach clobber another's setup, so we
  // serialise within this describe block. (Other Playwright projects in
  // sibling files still parallelise normally.)
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(60000);

  let originalErrorContents = '{}';

  test.beforeEach(async () => {
    // Snapshot whatever lives in target/error.json so we can restore on teardown.
    if (existsSync(TARGET_ERROR_JSON)) {
      originalErrorContents = readFileSync(TARGET_ERROR_JSON, 'utf-8');
    }
  });

  test.afterEach(async () => {
    // Always restore the original error.json so this spec can't poison
    // sibling tests in the same Playwright project.
    writeFileSync(TARGET_ERROR_JSON, originalErrorContents);
  });

  test('Step 1: Banner is hidden on a healthy project', async ({ page }) => {
    // Make sure error.json is empty (the success state).
    writeFileSync(TARGET_ERROR_JSON, '{}');

    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('compile-error-banner')).not.toBeVisible();
  });

  test('Step 2: Banner appears at the top of the home page when compile fails', async ({
    page,
  }) => {
    writeFileSync(TARGET_ERROR_JSON, JSON.stringify(COMPILE_FAILED_PAYLOAD));
    // Verify the disk write took effect before we ask the backend.
    const onDisk = readFileSync(TARGET_ERROR_JSON, 'utf-8');
    expect(onDisk).toContain('compile_failed');

    // Sanity check: confirm the backend exposes the new payload before we
    // tell the browser to navigate. A plain page.goto can race with the
    // filesystem write on slower CI hosts.
    const apiResponse = await page.request.get(`${BASE_URL}/api/error/`);
    const apiText = await apiResponse.text();
    expect(apiText).toContain('compile_failed');

    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    const banner = page.getByTestId('compile-error-banner');
    await expect(banner).toBeVisible({ timeout: 10000 });

    // Banner must include the summary and the descriptive header.
    await expect(
      page.getByText('Project compile failed — last good state shown below')
    ).toBeVisible();
    await expect(page.getByText('4 validation errors in Project')).toBeVisible();

    // First error path should render in <code> form.
    await expect(page.getByText('insights.0.props.type')).toBeVisible();

    // file:line hint should render as basename only.
    await expect(page.getByText(/\(project\.visivo\.yml:22\)/)).toBeVisible();

    // Visual snapshot for review.
    await page.screenshot({
      path: 'e2e/screenshots/compile-error-banner.png',
      fullPage: false,
    });
  });

  test('Step 3: Dashboard below the banner still renders (last-known-good preserved)', async ({
    page,
  }) => {
    writeFileSync(TARGET_ERROR_JSON, JSON.stringify(COMPILE_FAILED_PAYLOAD));

    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('compile-error-banner')).toBeVisible();

    // Home page navigation cards must still render below the banner — this
    // proves the viewer didn't get into a dead-state when compile failed.
    await expect(page.getByRole('heading', { name: 'Lineage', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Explorer', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Editor', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Project', exact: true })).toBeVisible();
  });

  test('Step 4: Banner truncates to 5 errors with overflow message', async ({ page }) => {
    const manyErrors = {
      ...COMPILE_FAILED_PAYLOAD,
      summary: '7 validation errors in Project',
      errors: Array.from({ length: 7 }, (_, i) => ({
        loc: ['insights', String(i), 'props', 'type'],
        msg: 'Field required',
        type: 'missing',
      })),
    };
    writeFileSync(TARGET_ERROR_JSON, JSON.stringify(manyErrors));

    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('compile-error-banner')).toBeVisible();
    await expect(page.getByText(/and 2 more/)).toBeVisible();
    await expect(page.getByText(/See terminal for full list/)).toBeVisible();
  });
});
