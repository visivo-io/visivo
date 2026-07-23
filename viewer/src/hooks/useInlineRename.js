import { useCallback, useState } from 'react';

/**
 * useInlineRename — the shared "am I editing this name right now" state
 * machine behind every inline-rename gesture in the app (Explore 2.0 Phase 3a
 * / B16, specs/plan/explorer-workspace-unification/04-bug-inventory.md).
 *
 * Before this hook, `ModelTabBar`, `InsightCRUDSection`, and `ChartCRUDSection`
 * each hand-rolled their own copy of the same shape: `[value, setValue]` +
 * `[error, setError]` + a `commitRename` that catches a collision error and
 * keeps the input open, + Enter/Escape/blur wiring. `ExplorationCard` and
 * `ExplorationPane`'s SubBar pencil independently hand-rolled the SIMPLER
 * "am I editing" toggle half of the same pattern around the shared
 * `InlineRenameInput` widget (`viewer/src/components/views/workspace/
 * InlineRenameInput.jsx`, which already owns the actual text-entry +
 * Enter/Escape/blur/commit-or-cancel mechanics).
 *
 * This hook is the ONE state machine both shapes need:
 *   - `editing`         — is the rename UI showing right now.
 *   - `error`            — the last collision/validation message, if any
 *                          (kept populated so the input stays open for a retry).
 *   - `start()`          — enter edit mode (clears any stale error).
 *   - `cancel()`         — leave edit mode without committing.
 *   - `commit(nextName)` — call the caller's rename action; if it THROWS an
 *                          error with `.code === 'NAME_COLLISION'` (the shape
 *                          `stores/explorerStore.js`'s `NameCollisionError`
 *                          already uses), the message is captured in `error`
 *                          and edit mode stays open for a retry. Any other
 *                          thrown error rethrows (a real bug, not a name
 *                          clash). A rename action that doesn't throw (e.g.
 *                          `workspaceExplorationsStore.js`'s `renameExploration`,
 *                          which resolves `{success, error}` instead of
 *                          throwing) simply exits edit mode — the exact
 *                          behavior `ExplorationCard`/`ExplorationPane` already
 *                          had.
 *
 * Callers that need the full text-entry mechanics pair this with
 * `InlineRenameInput`:
 *
 *   const rename = useInlineRename({ onCommit: nextName => renameThing(id, nextName) });
 *   return rename.editing ? (
 *     <InlineRenameInput name={name} onCommit={rename.commit} onCancel={rename.cancel} />
 *   ) : (
 *     <button onClick={rename.start}>{name}</button>
 *   );
 *   {rename.error && <span>{rename.error}</span>}
 *
 * Adopted by the Explore 2.0 Phase 3a query chips (`ExplorationQueryChips.jsx`,
 * which needs the full collision-retry behavior for `renameModelTab`) and by
 * `ExplorationCard`/`ExplorationPane`'s SubBar pencil (the simpler toggle
 * usage). `InsightCRUDSection`/`ChartCRUDSection`'s own hand-rolled copies are
 * a follow-up — noted, not swept in this change (03-delivery-plan.md's Phase
 * 3a scope: "adopt in the new chips + at least the Home-card rename; full
 * sweep of legacy call sites can note follow-ups").
 */
export default function useInlineRename({ onCommit } = {}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);

  const start = useCallback(() => {
    setError(null);
    setEditing(true);
  }, []);

  const cancel = useCallback(() => {
    setEditing(false);
    setError(null);
  }, []);

  const commit = useCallback(
    nextName => {
      try {
        onCommit && onCommit(nextName);
        setEditing(false);
        setError(null);
      } catch (err) {
        if (err && err.code === 'NAME_COLLISION') {
          setError(err.message);
          return; // stay in edit mode so the user can retry
        }
        throw err;
      }
    },
    [onCommit]
  );

  return { editing, error, start, cancel, commit };
}
