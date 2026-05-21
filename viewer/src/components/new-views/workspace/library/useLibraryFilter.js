import { useMemo } from 'react';

/**
 * useLibraryFilter — VIS-773 / Track C C2.
 *
 * Pure-functional filter logic for a Library section. Given a section's rows
 * + the active search query + the active type-filter chip, returns the
 * filtered rows. Pulled into its own hook so the tests can pin behaviour
 * without mounting the full Library tree.
 *
 * Two filters compose:
 *   - `search`     — case-insensitive substring match against the row name
 *                    (and `subtype`, so e.g. `csv_script_model` matches).
 *   - `typeFilter` — `null` for "all types", or a single type key
 *                    (`chart`, `model`, …); rows of any other type drop.
 *
 * Both the C-1 design and the section toolbar drive these: the toolbar's
 * search input feeds `search`, the type-filter chip row feeds `typeFilter`.
 */
export function useLibraryFilter({ rows, search, typeFilter }) {
  const query = (search || '').trim().toLowerCase();

  return useMemo(() => {
    let next = Array.isArray(rows) ? rows.slice() : [];

    if (typeFilter) {
      next = next.filter(r => r.type === typeFilter);
    }

    if (query) {
      next = next.filter(r => {
        const name = (r.name || '').toLowerCase();
        if (name.includes(query)) return true;
        // Allow matching on the subtype too (e.g. 'csv_script_model').
        if (r.subtype && String(r.subtype).toLowerCase().includes(query)) return true;
        return false;
      });
    }

    return next;
  }, [rows, query, typeFilter]);
}

export default useLibraryFilter;
