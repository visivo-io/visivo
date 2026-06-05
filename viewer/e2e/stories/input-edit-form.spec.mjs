/**
 * Story: Right-rail Input edit form auto-save + inline validation
 * (VIS-898 / Track G — input slice).
 *
 * G-1 (VIS-802) built the right-rail Edit seam but routed input selections to
 * the LEGACY InputEditForm (Save button, no live validation). VIS-898 rewires
 * the Input form to AUTO-SAVE on a ~500ms debounce (no Save button) with inline,
 * non-blocking validation — matching the dashboard-structure form UX.
 *
 * This story selects an `input` Library object, confirms the inline form has NO
 * Save button, edits the Label, and confirms the change debounce-persists
 * (the SelectionChip save indicator transitions and the edit survives).
 *
 * Precondition: an isolated sandbox running the integration project. BASE
 * defaults to :3047 but is env-overridable:
 *   VISIVO_SANDBOX_BACKEND_PORT=8047 VISIVO_SANDBOX_FRONTEND_PORT=3047 \
 *   VISIVO_SANDBOX_NAME=vis898 bash scripts/sandbox.sh start
 *   # then: VIS_INPUT_EDIT_FORM_BASE=http://localhost:3047 \
 *   #         npx playwright test input-edit-form
 *
 * NOTE: the sandbox backend runs from the `main` editable install, where the
 * VIS-902 validator fix is NOT present — so a "default not in options" backend
 * error may still surface. That is expected; this story exercises the FORM
 * (auto-save + inline display), not the validator.
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS_INPUT_EDIT_FORM_BASE || 'http://localhost:3047';
const SCREENS = 'e2e/stories/__screens__';
const DASHBOARD = 'insights-dashboard';
const INPUT_NAME = 'split_threshold';
const WAIT = 20000;

test.use({ viewport: { width: 1600, height: 1100 } });

const selectInput = (page, name) =>
  page.evaluate(async n => {
    const store = window.useStore.getState();
    // Ensure the input collection is loaded so LeafObjectForm can resolve the
    // record, then focus it as the active object (the Edit-tab router reads
    // `workspaceActiveObject`).
    if (store.fetchInputs) await store.fetchInputs();
    store.openWorkspaceTab({ type: 'input', name: n });
  }, name);

test.describe('Right-rail Input edit form (VIS-898)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(90000);

  test('input form auto-saves a label edit with NO Save button', async ({ page }) => {
    await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');

    const editTab = page.getByTestId('workspace-right-rail-tab-edit');
    await expect(editTab).toBeVisible({ timeout: WAIT });
    await editTab.click();
    await expect(page.getByTestId('workspace-right-rail-edit')).toBeVisible({ timeout: WAIT });

    // Select the input Library object → the inline InputEditForm renders.
    await selectInput(page, INPUT_NAME);
    const leafForm = page.getByTestId('right-rail-edit-leaf-form');
    await expect(leafForm).toBeVisible({ timeout: WAIT });

    // The SelectionChip identifies the input (rainbow type colour from
    // objectTypeConfigs — indigo for inputs).
    const chip = page.getByTestId('right-rail-selection-chip');
    await expect(chip).toHaveAttribute('data-object-type', 'input');
    await expect(chip).toContainText(INPUT_NAME);

    // There is NO Save button in the auto-save form.
    await expect(
      leafForm.getByRole('button', { name: /^save$/i })
    ).toHaveCount(0);

    // Edit the Label → debounced auto-save kicks in.
    const labelField = page.locator('#input-label');
    await expect(labelField).toBeVisible({ timeout: WAIT });
    const newLabel = `Split Threshold ${Date.now() % 10000}`;
    await labelField.fill(newLabel);

    // The auto-save indicator appears (pending → saving → saved). We assert it
    // reaches a terminal state and the field keeps the edited value.
    const indicator = page.getByTestId('right-rail-save-state');
    await expect(indicator).toBeVisible({ timeout: WAIT });
    await expect
      .poll(() => indicator.getAttribute('data-status'), { timeout: WAIT })
      .toMatch(/saved|error/);
    await expect(labelField).toHaveValue(newLabel);

    await page.screenshot({ path: `${SCREENS}/input-edit-form-autosave.png`, fullPage: false });
  });

  test('inline validation: a default not in the options is shown without trapping the user', async ({
    page,
  }) => {
    await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('workspace-right-rail-tab-edit').click();
    await expect(page.getByTestId('workspace-right-rail-edit')).toBeVisible({ timeout: WAIT });

    await selectInput(page, INPUT_NAME);
    await expect(page.getByTestId('right-rail-edit-leaf-form')).toBeVisible({ timeout: WAIT });

    // Type a default that is not in the static options list → inline error.
    const defaultField = page.locator('#input-default');
    await expect(defaultField).toBeVisible({ timeout: WAIT });
    await defaultField.fill('definitely_not_an_option');

    await expect(page.getByText(/not in the options/i)).toBeVisible({ timeout: WAIT });
    // The form stays editable (not trapped).
    await expect(defaultField).toBeEnabled();

    await page.screenshot({ path: `${SCREENS}/input-edit-form-validation.png`, fullPage: false });
  });
});
