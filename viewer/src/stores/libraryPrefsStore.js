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
 * Migration note: existing users with the old per-key localStorage entries
 * get a fresh default (start uncollapsed). The old keys are abandoned —
 * we don't ship a migration shim since collapse state is non-critical.
 */
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
        [key]: !s.libraryCollapsedSubsections[key],
      },
    }));
  },
});

export default createLibraryPrefsSlice;
