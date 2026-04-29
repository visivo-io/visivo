/**
 * Story: Branch 9 — Save flow writes directly to YAML on a fresh project.
 *
 * Validates:
 *   1. /api/project/draft_mode/ returns {enabled:false} for a project with no
 *      models / insights / dashboards.
 *   2. Hitting POST /api/sources/<name>/save/ followed by POST /api/publish/
 *      (the immediate-write path the viewer's saveSource now follows when
 *      draft mode is off) lands the source in project.visivo.yml on disk.
 *   3. After publish, /api/publish/status/ reports has_unpublished_changes=false
 *      so no Publish button would appear in the TopNav.
 *
 * Precondition: dedicated sandbox running on :3019/:8019 against the
 * test-projects/save-flow-immediate-write fixture.
 *   bash scripts/sandbox-save-flow.sh start
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import jsYaml from 'js-yaml';
import {
  snapshotProject,
  restoreProject,
  waitForServerReload,
} from '../helpers/file-snapshot.mjs';

const parseYaml = jsYaml.load;
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  'test-projects',
  'save-flow-immediate-write'
);
const PROJECT_FILE = join(PROJECT_DIR, 'project.visivo.yml');
const BACKEND_URL =
  process.env.SAVE_FLOW_BACKEND_URL || 'http://localhost:8019';
const FRONTEND_URL =
  process.env.SAVE_FLOW_FRONTEND_URL || 'http://localhost:3019';

/** @type {Map<string, string> | null} */
let baselineSnapshot = null;

test.describe('Save flow — immediate write on fresh project', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(60000);

  test.beforeAll(async () => {
    baselineSnapshot = snapshotProject(PROJECT_DIR);
    if (baselineSnapshot.size === 0) {
      throw new Error(
        `No *.visivo.yml files found in ${PROJECT_DIR}. Is the save-flow ` +
          `sandbox project present?`
      );
    }
  });

  test.beforeEach(async () => {
    if (!baselineSnapshot) throw new Error('baselineSnapshot missing');
    const wrote = restoreProject(baselineSnapshot);
    if (wrote > 0) {
      await waitForServerReload(BACKEND_URL);
    }
  });

  test.afterAll(async () => {
    if (!baselineSnapshot) return;
    restoreProject(baselineSnapshot);
    await waitForServerReload(BACKEND_URL);
  });

  test('Fresh project reports draft_mode enabled=false', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/project/draft_mode/`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toEqual({ enabled: false });
  });

  test('Save + immediate publish writes the source into project.visivo.yml', async ({
    request,
  }) => {
    const sourceName = 'fresh_immediate_source';
    const sqlitePath = join(PROJECT_DIR, 'test.sqlite');

    // 1. Save the source to cache (the first half of the immediate-write flow).
    const saveRes = await request.post(
      `${BACKEND_URL}/api/sources/${sourceName}/save/`,
      {
        data: {
          name: sourceName,
          type: 'sqlite',
          database: sqlitePath,
        },
      }
    );
    expect(saveRes.ok()).toBe(true);

    // 2. Trigger publish — this is what saveSource does automatically
    //    when fetchDraftMode() returns false.
    const publishRes = await request.post(`${BACKEND_URL}/api/publish/`);
    expect(publishRes.ok()).toBe(true);

    // 3. Give the hot-reload watcher a moment to re-parse.
    await waitForServerReload(BACKEND_URL);

    // 4. Verify YAML on disk has the source.
    const doc = parseYaml(readFileSync(PROJECT_FILE, 'utf8'));
    const sourceNames = (doc.sources ?? []).map(s => s.name);
    expect(sourceNames, 'fresh source landed in project.visivo.yml').toContain(
      sourceName
    );
    const sourceEntry = doc.sources.find(s => s.name === sourceName);
    expect(sourceEntry.type).toBe('sqlite');

    // 5. Publish status should now report no unpublished changes — meaning
    //    the green Publish button would NOT appear in the TopNav.
    const statusRes = await request.get(
      `${BACKEND_URL}/api/publish/status/`
    );
    expect(statusRes.ok()).toBe(true);
    const status = await statusRes.json();
    expect(status.has_unpublished_changes).toBe(false);
  });

  test('Editor route loads and shows no Publish button for fresh project', async ({
    page,
  }) => {
    await page.goto(`${FRONTEND_URL}/editor`);
    await page.waitForLoadState('networkidle');

    // Give the topnav a moment to settle on initial publish-status check.
    await page.waitForTimeout(1500);

    // The Publish button only appears when has_unpublished_changes=true.
    // On a fresh project with no edits the button must not be visible.
    const publishBtn = page.getByRole('button', { name: /^Publish$/ });
    await expect(publishBtn).toHaveCount(0);

    await page.screenshot({
      path: 'e2e/screenshots/save-flow-editor-fresh.png',
      fullPage: false,
    });
  });
});
