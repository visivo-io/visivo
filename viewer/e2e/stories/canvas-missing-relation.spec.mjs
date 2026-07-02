/**
 * Story: inline missing-relation fix in the insight preview (VIS-1007).
 *
 * When an insight/table preview spans 2+ models with no relation between them,
 * the preview run fails with a typed `NoJoinPathError`. Instead of a dead-end
 * red error block, the preview surfaces an inline "draw the join" card
 * (`missing-relation-card`) that embeds VIS-1006's JoinOperatorPopover seeded
 * with the two offending models. Authoring the relation re-triggers the preview
 * so it re-runs green. The ambiguous case (`AmbiguousJoinError`) renders a
 * simple path-picker card (`ambiguous-relation-card`).
 *
 * End-to-end typing (see PR): the query builder raises a typed JoinPathError
 * carrying `model_a`/`model_b`; `run_insight_job` attaches structured
 * `error_details` ({ error_type, error_models }) to the JobResult; the preview
 * executor threads those onto the run-status payload; `usePreviewJob` →
 * `usePreviewData` → `InsightPreview` consume them and pick the inline card.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS STORY IS DOCUMENTATION-ONLY (no live assertion):
 *
 * Reproducing a *live* NoJoinPathError needs an insight that references columns
 * from two models with NO relation declared between them. The integration test
 * project (test-projects/integration) ships only single-model insights plus the
 * one `local_to_local` relation — there is no unjoined-two-model insight, and
 * per the VIS-1007 task we do NOT fabricate fixtures just to force the error.
 *
 * Coverage instead lives in fast, deterministic unit + integration tests:
 *   - viewer/src/hooks/usePreviewJob.test.js
 *       → surfaces `error_details` from the run-status payload.
 *   - viewer/src/hooks/usePreviewData.test.js
 *       → passes `errorDetails` through the preview-data chain.
 *   - viewer/src/components/views/common/InsightPreview.test.jsx
 *       → renders `missing-relation-card` (with the popover) for
 *         `error_type: 'missing_relation'`, `ambiguous-relation-card` for
 *         `ambiguous_relation`, and the plain error otherwise; a save calls
 *         `resetPreview` (the re-run trigger).
 *   - viewer/src/components/views/common/InsightPreviewRelationCards.test.jsx
 *       → mounts the REAL JoinOperatorPopover: the card seeds it with the model
 *         pair and a save calls `saveRelation` + the re-run callback.
 *   - backend: tests/jobs/test_run_insight_job_join_errors.py (real two-model
 *     run yields error_type='missing_relation' + the pair),
 *     tests/server/jobs/test_preview_job_executor.py (threading to run status),
 *     tests/query/test_relation_graph.py::TestStructuredJoinErrorFields.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MANUAL REPRO (to validate the live flow against a real backend):
 *
 *   1. In a test project, add two models with NO relation between them, e.g.
 *        models:
 *          - name: orders   { sql: "select 1 as user_id, 10 as amount", source: ref(duck) }
 *          - name: users    { sql: "select 1 as id, 30 as age",        source: ref(duck) }
 *   2. Add an insight that pulls a field from EACH model:
 *        insights:
 *          - name: cross_model
 *            props: { type: scatter, x: "?{ ${ ref(orders).amount } }",
 *                                    y: "?{ ${ ref(users).age } }" }
 *   3. `visivo serve`, open the workspace, select the `cross_model` insight.
 *   4. The preview run fails; the inline `missing-relation-card` appears (NOT a
 *      red error) listing `orders` + `users`. Click "Draw the join".
 *   5. The JoinOperatorPopover opens pre-seeded with both models; pick a column
 *      on each side, Save. The relation is written and the preview re-runs green.
 *   6. For the ambiguous case, declare TWO relations connecting the same model
 *      pair via different intermediates; the preview shows `ambiguous-relation-
 *      card` listing both candidate relations.
 *
 * Precondition for any future live run: sandbox on :3001
 * (`bash scripts/sandbox.sh start`) AND a project containing an unjoined
 * two-model insight as above.
 */

import { test, expect } from '@playwright/test';
import { openWorkspace, selectLibraryObject, WAIT } from '../helpers/workspace.mjs';

test.describe('Inline missing-relation fix (VIS-1007)', () => {
  test.setTimeout(90000);

  // Documentation placeholder for the live flow. Skipped because the
  // integration project has no unjoined-two-model insight to trigger a real
  // NoJoinPathError, and VIS-1007 forbids fabricating fixtures. Unskip after
  // adding such an insight (see MANUAL REPRO) and set INSIGHT_NAME below.
  test.skip('shows the missing-relation card for an unjoined-model insight', async ({ page }) => {
    const INSIGHT_NAME = 'cross_model'; // must reference two unjoined models
    await openWorkspace(page);
    await selectLibraryObject(page, 'insight', INSIGHT_NAME);

    // The preview run fails typed; the inline join-fix card replaces the red
    // error block and embeds the JoinOperatorPopover trigger.
    await expect(page.getByTestId('missing-relation-card')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('preview-error')).toHaveCount(0);

    await page.getByTestId('missing-relation-draw-join').click();
    await expect(page.getByTestId('join-operator-popover')).toBeVisible({ timeout: WAIT });
  });
});
