/**
 * libraryPrefsStore — Library rail collapse prefs (PR #421 review).
 *
 * Pins the set/toggle behaviour for both section and subsection collapse
 * maps so consumers (LibrarySection, LibrarySubsection) can rely on a
 * stable contract. The slice is wired through Zustand's `persist`
 * middleware in `store.js`; persistence itself is a middleware concern
 * (verified by the existing `common-storage` slice) — these tests cover
 * the slice's pure action shape.
 */
import { act } from '@testing-library/react';
import useStore from './store';
import { isLibrarySubsectionCollapsed } from './libraryPrefsStore';

const reset = () => {
  act(() => {
    useStore.setState({
      libraryCollapsedSections: {},
      libraryCollapsedSubsections: {},
    });
  });
};

describe('library prefs store slice', () => {
  beforeEach(reset);

  describe('sections', () => {
    test('setLibrarySectionCollapsed sets the section flag (truthy → true)', () => {
      act(() => useStore.getState().setLibrarySectionCollapsed('layout', true));
      expect(useStore.getState().libraryCollapsedSections.layout).toBe(true);
      act(() => useStore.getState().setLibrarySectionCollapsed('layout', false));
      expect(useStore.getState().libraryCollapsedSections.layout).toBe(false);
      act(() => useStore.getState().setLibrarySectionCollapsed('layout', 'truthy-string'));
      expect(useStore.getState().libraryCollapsedSections.layout).toBe(true);
    });

    test('toggleLibrarySectionCollapsed flips the section flag', () => {
      // First toggle: undefined → true.
      act(() => useStore.getState().toggleLibrarySectionCollapsed('data'));
      expect(useStore.getState().libraryCollapsedSections.data).toBe(true);
      // Second toggle: true → false.
      act(() => useStore.getState().toggleLibrarySectionCollapsed('data'));
      expect(useStore.getState().libraryCollapsedSections.data).toBe(false);
    });

    test('setting one section leaves others alone', () => {
      act(() => useStore.getState().setLibrarySectionCollapsed('layout', true));
      act(() => useStore.getState().setLibrarySectionCollapsed('data', true));
      expect(useStore.getState().libraryCollapsedSections).toEqual({
        layout: true,
        data: true,
      });
      act(() => useStore.getState().toggleLibrarySectionCollapsed('layout'));
      expect(useStore.getState().libraryCollapsedSections).toEqual({
        layout: false,
        data: true,
      });
    });
  });

  describe('subsections', () => {
    test('setLibrarySubsectionCollapsed sets the subsection flag', () => {
      act(() => useStore.getState().setLibrarySubsectionCollapsed('chart', true));
      expect(useStore.getState().libraryCollapsedSubsections.chart).toBe(true);
      act(() => useStore.getState().setLibrarySubsectionCollapsed('chart', false));
      expect(useStore.getState().libraryCollapsedSubsections.chart).toBe(false);
    });

    test('toggleLibrarySubsectionCollapsed flips from the collapsed default (VIS-828)', () => {
      // No saved pref → effectively collapsed → first toggle expands (false).
      act(() => useStore.getState().toggleLibrarySubsectionCollapsed('source'));
      expect(useStore.getState().libraryCollapsedSubsections.source).toBe(false);
      // Second toggle collapses again (true).
      act(() => useStore.getState().toggleLibrarySubsectionCollapsed('source'));
      expect(useStore.getState().libraryCollapsedSubsections.source).toBe(true);
    });

    test('section + subsection maps are independent', () => {
      act(() => useStore.getState().toggleLibrarySectionCollapsed('layout'));
      // Toggling a default-collapsed subsection expands it (explicit false).
      act(() => useStore.getState().toggleLibrarySubsectionCollapsed('chart'));
      expect(useStore.getState().libraryCollapsedSections).toEqual({ layout: true });
      expect(useStore.getState().libraryCollapsedSubsections).toEqual({ chart: false });
    });
  });

  describe('isLibrarySubsectionCollapsed (default-collapsed semantics)', () => {
    test('treats a missing entry as collapsed', () => {
      expect(isLibrarySubsectionCollapsed({}, 'chart')).toBe(true);
      expect(isLibrarySubsectionCollapsed(undefined, 'chart')).toBe(true);
    });

    test('honours an explicit boolean preference', () => {
      expect(isLibrarySubsectionCollapsed({ chart: false }, 'chart')).toBe(false);
      expect(isLibrarySubsectionCollapsed({ chart: true }, 'chart')).toBe(true);
    });
  });
});
