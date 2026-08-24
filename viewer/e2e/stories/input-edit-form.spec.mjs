/**
 * Story: Right-rail Input edit form — explicit Delete · Discard · Save
 * (VIS-898 / Track G — input slice; unified panels).
 *
 * The Input edit panel is a standard leaf form: edits are held locally and
 * persisted only on an explicit Save through the shared Delete · Discard · Save
 * footer (matching chart/insight/source/…). Save is gated on real edits, Discard
 * reverts to the last-saved values, and validation is inline + non-blocking.
 *
 * This story selects an `input` Library object, confirms the footer, edits the
 * Label, saves, and confirms the edit persists. It also confirms Discard reverts
 * an in-progress edit and that inline validation surfaces without trapping.
 *
 * Precondition: an isolated sandbox running the integration project. BASE
 * defaults to :3047 but is env-overridable:
 *   VISIVO_SANDBOX_BACKEND_PORT=8047 VISIVO_SANDBOX_FRONTEND_PORT=3047 \
 *   VISIVO_SANDBOX_NAME=vis898 bash scripts/sandbox.sh start
 *   # then: VIS_INPUT_EDIT_FORM_BASE=http://localhost:3047 \
 *   #         npx playwright test input-edit-form
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

  test('input form saves a label edit through the Delete · Discard · Save footer', async ({ page }) => {
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

    // The SelectionChip identifies the input.
    const chip = page.getByTestId('right-rail-selection-chip');
    await expect(chip).toHaveAttribute('data-object-type', 'input');
    await expect(chip).toContainText(INPUT_NAME);

    // The shared footer: Save is present and disabled until an edit is made.
    const saveBtn = page.getByTestId('form-footer-save');
    const discardBtn = page.getByTestId('form-footer-cancel');
    await expect(saveBtn).toBeVisible({ timeout: WAIT });
    await expect(discardBtn).toHaveText(/discard/i);
    await expect(saveBtn).toBeDisabled();

    // Edit the Label → Save enables.
    const labelField = page.locator('#input-label');
    await expect(labelField).toBeVisible({ timeout: WAIT });
    const newLabel = `Split Threshold ${Date.now() % 10000}`;
    await labelField.fill(newLabel);
    await expect(saveBtn).toBeEnabled();

    // Save → the edit persists (the field keeps its value and Save re-disables
    // once the baseline advances to the saved value).
    await saveBtn.click();
    await expect(labelField).toHaveValue(newLabel);
    await expect(saveBtn).toBeDisabled({ timeout: WAIT });

    await page.screenshot({ path: `${SCREENS}/input-edit-form-save.png`, fullPage: false });
  });

  test('Discard reverts an in-progress label edit to the last-saved value', async ({ page }) => {
    await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('workspace-right-rail-tab-edit').click();
    await expect(page.getByTestId('workspace-right-rail-edit')).toBeVisible({ timeout: WAIT });

    await selectInput(page, INPUT_NAME);
    await expect(page.getByTestId('right-rail-edit-leaf-form')).toBeVisible({ timeout: WAIT });

    const labelField = page.locator('#input-label');
    await expect(labelField).toBeVisible({ timeout: WAIT });
    const saved = await labelField.inputValue();

    await labelField.fill('Scratch edit — should not stick');
    const discardBtn = page.getByTestId('form-footer-cancel');
    await expect(discardBtn).toBeEnabled();
    await discardBtn.click();

    await expect(labelField).toHaveValue(saved);
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
