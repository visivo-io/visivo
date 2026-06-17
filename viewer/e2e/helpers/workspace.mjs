/**
 * Shared helpers for Workspace canvas e2e stories (Canvas Object Surfaces).
 *
 * The Workspace exposes two navigation idioms:
 *   - dashboards are routed: /workspace/dashboard/:name
 *   - every other object type is selected by clicking its Library row (the URL
 *     stays /workspace; selection lives in the Zustand store).
 */
import { expect } from '@playwright/test';

export const BASE = process.env.VIS_CANVAS_BASE || 'http://localhost:3001';
export const SCREENS = 'e2e/stories/__screens__';
export const WAIT = 20000;

// Vite HMR / ResizeObserver / favicon noise is not a product error. Resource
// load failures are tracked via the response listener so a best-effort endpoint
// can be whitelisted by URL.
const REAL_ERROR = t =>
  !/favicon|DevTools|ResizeObserver|sourcemap|\[vite\]|hot updated|Failed to load resource/i.test(
    t
  );

// Workspace telemetry is best-effort: emitWorkspaceEvent POSTs to
// /api/telemetry/workspace-event/ and swallows failures. In the sandbox the
// relay returns 405 (the VIS-822 backend wiring isn't on this branch / the
// venv12 backend is cross-wired) — infra noise, not a canvas defect.
const BENIGN_API = url => url.includes('/api/telemetry/workspace-event/');

/** Attach JS-error + failed-API listeners; returns the (mutated) errors array. */
export const collectErrors = page => {
  const errors = [];
  page.on('console', m => {
    if (m.type() === 'error' && REAL_ERROR(m.text())) errors.push(m.text());
  });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('response', resp => {
    const url = resp.url();
    if (url.includes('/api/') && resp.status() >= 400 && !BENIGN_API(url)) {
      errors.push(`HTTP ${resp.status()} ${url}`);
    }
  });
  return errors;
};

/** Open the unscoped Workspace (project overview + Library). */
export const openWorkspace = async page => {
  await page.goto(`${BASE}/workspace`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-left-rail')).toBeVisible({ timeout: WAIT });
};

/** Open a dashboard canvas via its route and wait for the render + overlay. */
export const openDashboardCanvas = async (page, name) => {
  await page.goto(`${BASE}/workspace/dashboard/${name}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('project-canvas')).toBeVisible({ timeout: WAIT });
  await expect(page.getByTestId(`dashboard_${name}`)).toBeVisible({ timeout: WAIT });
};

const SECTION_LABEL = type => `${type.charAt(0).toUpperCase()}${type.slice(1)}s`;

/**
 * Select a Library object by type + name. Expands the object's collapsible
 * section first if the row isn't already mounted. The count in the section
 * header ("Insights (32)") disambiguates it from the type-filter chip.
 */
export const selectLibraryObject = async (page, type, name) => {
  const row = page.getByTestId(`library-row-${type}-${name}`);
  if (!(await row.isVisible().catch(() => false))) {
    const section = page.getByRole('button', {
      name: new RegExp(`^${SECTION_LABEL(type)} \\(\\d+\\)`),
    });
    if (await section.first().isVisible().catch(() => false)) {
      await section.first().click();
    }
  }
  await expect(row).toBeVisible({ timeout: WAIT });
  await row.click();
};

/** Click the right-rail Outline/Data tab. */
export const openDataTab = async page => {
  const tab = page.getByTestId('workspace-right-rail-tab-outline');
  await expect(tab).toBeVisible({ timeout: WAIT });
  await tab.click();
};
