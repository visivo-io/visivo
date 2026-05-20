import { useMemo } from 'react';

/**
 * useLibraryFilter — VIS-773 / Track C C2.
 *
 * Pure-functional filter logic for a Library section. Given a section's rows
 * + the active search query + the active scope chip, returns the filtered
 * rows. Pulled into its own hook so the C2 tests can pin behaviour without
 * mounting the full Library tree.
 *
 * Scope chips (delivered design revision):
 *   - `all`        — all rows in the section. Default.
 *   - `usedHere`   — only rows used by the current scoped object. Disabled
 *                    until a scope is active.
 *   - `compatible` — only rows compatible with the currently selected slot.
 *                    Disabled until a typed slot is selected on the canvas.
 *
 * `usedHere` / `compatible` are currently best-effort: the wired logic uses
 * the lineage selector + the active object's reference list when available,
 * and falls back to passing every row through when the inputs aren't
 * populated yet. Track D (canvas drop targets) + the lineage cache (Wave 3)
 * are what make these chips really sing — for now the chips render but
 * behave conservatively (no false negatives).
 */
export function useLibraryFilter({
  rows,
  search,
  scopeChip,
  scope,
  usedNames,
  compatibleTypes,
}) {
  const query = (search || '').trim().toLowerCase();

  return useMemo(() => {
    let next = Array.isArray(rows) ? rows.slice() : [];

    if (query) {
      next = next.filter((r) => {
        const name = (r.name || '').toLowerCase();
        if (name.includes(query)) return true;
        // Allow matching on the subtype too (e.g. 'csv_script_model').
        if (r.subtype && String(r.subtype).toLowerCase().includes(query)) return true;
        // Allow matching on the row label (used for the Insert section,
        // where 'Markdown' is both the name and a separate object type).
        if (r.label && String(r.label).toLowerCase().includes(query)) return true;
        return false;
      });
    }

    if (scopeChip === 'usedHere' && scope && scope !== 'root') {
      const used = new Set(Array.isArray(usedNames) ? usedNames : []);
      // If we don't yet have a populated `usedNames` set, fall back to
      // letting every row through — never raise a false negative.
      if (used.size > 0) {
        next = next.filter((r) => used.has(r.name));
      }
    }

    if (scopeChip === 'compatible' && Array.isArray(compatibleTypes) && compatibleTypes.length > 0) {
      const compat = new Set(compatibleTypes);
      next = next.filter((r) => compat.has(r.type));
    }

    return next;
  }, [rows, query, scopeChip, scope, usedNames, compatibleTypes]);
}

export default useLibraryFilter;
