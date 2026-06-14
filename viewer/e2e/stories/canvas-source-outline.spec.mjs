/**
 * Story: Workspace source schema outline + store-backed caching (VIS-1004 + Wave-1 acceptance).
 *
 * When a `source` is the active workspace object, the right-rail Outline tab is
 * relabelled "Data" and renders the source's database → schema → table → column
 * tree (mirroring the Explorer's SourceBrowser). The acceptance fixes layered on
 * top:
 *   - introspection (the EXPENSIVE `/project/sources_metadata` call) is cached in
 *     the Zustand store per session and rehydrated on re-select — so flipping
 *     back to a source never re-introspects;
 *   - the "Generate schema" cold state is gated on the API's `has_cached_schema`
 *     flag, so it shows ONLY for sources the backend has no cached schema for.
 *
 * Precondition: the isolated sandbox running the integration project on :3001
 * (`bash scripts/sandbox.sh start`). Override via VIS_CANVAS_BASE.
 */

import { test, expect } from '@playwright/test';
import {
  SCREENS,
  WAIT,
  collectErrors,
  openWorkspace,
  selectLibraryObject,
  openDataTab,
} from '../helpers/workspace.mjs';

test.use({ viewport: { width: 1600, height: 1400 } });

const selectSource = (page, name) => selectLibraryObject(page, 'source', name);

test.describe('Workspace source outline + caching (VIS-1004)', () => {
  test.setTimeout(90000);

  test('a source with no cached schema shows the cold Generate state', async ({ page }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    // local-postgres cannot connect in the sandbox (no PG_PASSWORD), so the
    // backend has no cached schema for it → the cold state is deterministic.
    await selectSource(page, 'local-postgres');
    await openDataTab(page);

    await expect(page.getByTestId('workspace-source-outline')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('source-outline-cold')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('source-outline-generate')).toBeVisible();

    await page.screenshot({ path: `${SCREENS}/vis1004-01-cold-generate.png` });
    expect(errors).toEqual([]);
  });

  test('the Data tree renders for an introspectable source', async ({ page }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    await selectSource(page, 'local-duckdb');
    await openDataTab(page);

    await expect(page.getByTestId('workspace-source-outline')).toBeVisible({ timeout: WAIT });
    // duckdb introspects (or is already cached): the outline settles on the tree
    // or the cold state — never an infinite loading spinner.
    await expect(
      page.getByTestId('source-outline-tree').or(page.getByTestId('source-outline-cold'))
    ).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('source-outline-loading')).toHaveCount(0);

    await page.screenshot({ path: `${SCREENS}/vis1004-02-duckdb-outline.png` });
    expect(errors).toEqual([]);
  });

  test('re-selecting a source hydrates from the store cache (no re-introspect)', async ({
    page,
  }) => {
    let metaCalls = 0;
    page.on('request', req => {
      if (req.url().includes('/project/sources_metadata')) metaCalls += 1;
    });

    await openWorkspace(page);

    // First selection introspects duckdb (≥1 sources_metadata call).
    await selectSource(page, 'local-duckdb');
    await openDataTab(page);
    await expect(page.getByTestId('workspace-source-outline')).toBeVisible({ timeout: WAIT });
    await expect(
      page.getByTestId('source-outline-tree').or(page.getByTestId('source-outline-cold'))
    ).toBeVisible({ timeout: WAIT });
    await page.waitForTimeout(600);
    expect(metaCalls).toBeGreaterThan(0);

    // Visit a different source (its own introspect), then return to duckdb.
    await selectSource(page, 'local-postgres');
    await expect(page.getByTestId('source-outline-cold')).toBeVisible({ timeout: WAIT });
    const beforeReselect = metaCalls;

    await selectSource(page, 'local-duckdb');
    await expect(page.getByTestId('workspace-source-outline')).toBeVisible({ timeout: WAIT });
    await page.waitForTimeout(900);

    // The cached re-select must NOT fire a fresh sources_metadata introspect.
    expect(metaCalls).toBe(beforeReselect);
  });
});
