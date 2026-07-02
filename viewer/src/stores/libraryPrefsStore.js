/**
 * libraryPrefsStore — persisted UI preferences for the Library rail.
 *
 * Holds the collapsed state of each section (Layout / Data) + each per-type
 * subsection so the rail remembers what the user collapsed across reloads.
 * Persisted via Zustand's `persist` middleware in `store.js` so components
 * can be pure subscribers (no inline localStorage in the rendering path).
 *
 * Before this slice landed, `LibrarySection` and `LibrarySubsection` each
 * inlined their own `read/writePersistedCollapsed` helpers against
 * `library:section-collapsed:<key>` / `library:subsection-collapsed:<key>`
 * — a thin layer of localStorage that really belonged in the store.
 *
 * Shape:
 *   libraryCollapsedSections    — { [sectionKey: string]: boolean }
 *   libraryCollapsedSubsections — { [typeKey:    string]: boolean }
 *
 * Default-collapsed semantics differ between the two maps (VIS-828):
 *   - SECTIONS default to EXPANDED: absence of an entry means expanded, so
 *     the two top sections (Layout Items / Data Layer) stay open on first
 *     visit.
 *   - SUBSECTIONS default to COLLAPSED: absence of an entry means collapsed,
 *     so the long per-type lists stay tucked away until the user opens them.
 *     Only EXPLICIT deviations are stored — an `undefined` entry is treated
 *     as collapsed (see `isLibrarySubsectionCollapsed`), and an explicitly
 *     persisted `false` keeps a user-expanded subsection open across reloads.
 *
 * Migration note: existing users with the old per-key localStorage entries
 * get a fresh default (sections expanded, subsections collapsed). The old
 * keys are abandoned — we don't ship a migration shim since collapse state
 * is non-critical.
 */

/**
 * Effective collapsed state for a per-type subsection. `undefined` (no saved
 * preference) is treated as collapsed; an explicit boolean wins. Shared by the
 * component selector and the toggle action so both agree on the default.
 */
export const isLibrarySubsectionCollapsed = (collapsedMap, typeKey) => {
  const value = collapsedMap?.[typeKey];
  return value === undefined ? true : !!value;
};

const createLibraryPrefsSlice = (set, _get) => ({
  libraryCollapsedSections: {},
  libraryCollapsedSubsections: {},

  setLibrarySectionCollapsed: (key, value) => {
    set(s => ({
      libraryCollapsedSections: {
        ...s.libraryCollapsedSections,
        [key]: !!value,
      },
    }));
  },

  toggleLibrarySectionCollapsed: key => {
    set(s => ({
      libraryCollapsedSections: {
        ...s.libraryCollapsedSections,
        [key]: !s.libraryCollapsedSections[key],
      },
    }));
  },

  setLibrarySubsectionCollapsed: (key, value) => {
    set(s => ({
      libraryCollapsedSubsections: {
        ...s.libraryCollapsedSubsections,
        [key]: !!value,
      },
    }));
  },

  toggleLibrarySubsectionCollapsed: key => {
    set(s => ({
      libraryCollapsedSubsections: {
        ...s.libraryCollapsedSubsections,
        // Subsections default collapsed, so flip the *effective* state —
        // an absent entry reads as collapsed and toggles to expanded.
        [key]: !isLibrarySubsectionCollapsed(s.libraryCollapsedSubsections, key),
      },
    }));
  },
});

export default createLibraryPrefsSlice;
