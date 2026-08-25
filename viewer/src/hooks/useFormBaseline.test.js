/**
 * useFormBaseline — the seed/dirty/revert primitive behind the rail's Discard
 * button (VIS-1133).
 *
 * The behaviour that matters is the baseline ADVANCING: a form whose baseline
 * never moved would report itself permanently dirty after its first save, and
 * Discard would keep offering to undo work the user already committed.
 */
import { renderHook, act } from '@testing-library/react';
import useFormBaseline from './useFormBaseline';
import { readDraft, writeDraft } from '../utils/formDrafts';

/** Drive the hook with a spy `apply` so we can see what it pushes back. */
const setup = (draftKey) => {
  const applied = [];
  const apply = values => applied.push(values);
  const view = renderHook(() => useFormBaseline(apply, draftKey));
  return { view, applied };
};

beforeEach(() => window.localStorage.clear());

describe('useFormBaseline', () => {
  it('reports clean before the first seed, so a mounting form never flashes enabled', () => {
    const { view } = setup();
    expect(view.result.current.isDirtyAgainst({ name: 'anything' })).toBe(false);
  });

  it('seeds form state and records it as the clean baseline', () => {
    const { view, applied } = setup();
    act(() => view.result.current.seed({ name: 'orders', sql: 'select 1' }));

    expect(applied).toEqual([{ name: 'orders', sql: 'select 1' }]);
    expect(view.result.current.isDirtyAgainst({ name: 'orders', sql: 'select 1' })).toBe(false);
  });

  it('is dirty once any field differs', () => {
    const { view } = setup();
    act(() => view.result.current.seed({ name: 'orders', sql: 'select 1' }));
    expect(view.result.current.isDirtyAgainst({ name: 'orders', sql: 'select 2' })).toBe(true);
  });

  it('compares deeply — a structurally equal array or object is NOT a change', () => {
    // The forms hold arrays/objects (dimensions, layout, props) that are
    // rebuilt on every render, so reference equality would report every form
    // as permanently dirty.
    const { view } = setup();
    act(() =>
      view.result.current.seed({ dimensions: [{ name: 'region' }], layout: { title: 'x' } })
    );
    expect(
      view.result.current.isDirtyAgainst({
        dimensions: [{ name: 'region' }],
        layout: { title: 'x' },
      })
    ).toBe(false);
    expect(
      view.result.current.isDirtyAgainst({
        dimensions: [{ name: 'country' }],
        layout: { title: 'x' },
      })
    ).toBe(true);
  });

  it('discard pushes the baseline back through apply', () => {
    const { view, applied } = setup();
    act(() => view.result.current.seed({ name: 'orders' }));
    applied.length = 0;

    act(() => view.result.current.discard());

    expect(applied).toEqual([{ name: 'orders' }]);
  });

  it('discard before any seed is a no-op rather than a crash', () => {
    const { view, applied } = setup();
    act(() => view.result.current.discard());
    expect(applied).toEqual([]);
  });

  it('with no draftKey nothing is ever written to storage (create/embedded forms)', () => {
    const { view } = setup(undefined);
    act(() => view.result.current.seed({ name: 'orders' }));
    view.rerender();
    expect(window.localStorage.length).toBe(0);
  });

  it('re-seeding advances the baseline — this is what clears dirty after a save', () => {
    // The rail persists through useRecordSave, whose optimistic write replaces
    // the store record with a NEW object; the form's [record]-keyed effect then
    // re-seeds. Without this, a saved form stays dirty forever.
    const { view, applied } = setup();
    act(() => view.result.current.seed({ name: 'orders' }));
    expect(view.result.current.isDirtyAgainst({ name: 'edited' })).toBe(true);

    act(() => view.result.current.seed({ name: 'edited' }));

    expect(view.result.current.isDirtyAgainst({ name: 'edited' })).toBe(false);

    // ...and Discard now returns to the NEW baseline, not the pre-save one.
    applied.length = 0;
    act(() => view.result.current.discard());
    expect(applied).toEqual([{ name: 'edited' }]);
  });
});

/**
 * Per-object draft persistence. These drive the hook the way a real form does:
 * every render calls `isDirtyAgainst` with the form's CURRENT values, which is
 * how the hook learns what to mirror. `rerender({ values })` therefore stands
 * in for "the user typed".
 */
describe('useFormBaseline — per-object drafts', () => {
  const KEY = 'chart:revenue';
  const SAVED = { name: 'revenue', layout: { title: 'Q1' } };
  const EDITED = { name: 'revenue', layout: { title: 'EDITED' } };

  /** A form: seeds from its record, and reports dirty on every render. */
  const setupForm = (draftKey = KEY) => {
    const applied = [];
    const apply = values => applied.push(values);
    const view = renderHook(
      ({ values }) => {
        const baseline = useFormBaseline(apply, draftKey);
        return {
          ...baseline,
          dirty: values === undefined ? false : baseline.isDirtyAgainst(values),
        };
      },
      { initialProps: { values: undefined } }
    );
    /** Seed, then render with whatever `apply` pushed (what a real form does). */
    const seedWith = saved => {
      act(() => view.result.current.seed(saved));
      view.rerender({ values: applied[applied.length - 1] });
    };
    return { view, applied, seedWith };
  };

  it('mirrors unsaved values to storage once the form goes dirty', () => {
    const { view, seedWith } = setupForm();
    seedWith(SAVED);
    expect(readDraft(KEY)).toBeNull(); // clean form stores nothing

    view.rerender({ values: EDITED }); // the user types
    expect(readDraft(KEY)).toEqual({ baseline: SAVED, values: EDITED });
  });

  it('restores the unsaved values when the object is opened again', () => {
    // The rail destroys the form on every object switch; the DRAFT is what
    // survives. Simulate: a draft exists, and a fresh form seeds the record.
    writeDraft(KEY, SAVED, EDITED);

    const { view, applied, seedWith } = setupForm();
    seedWith(SAVED);

    // The form comes back with the user's edits…
    expect(applied[applied.length - 1]).toEqual(EDITED);
    // …reported as unsaved (the baseline is still the SAVED values)…
    expect(view.result.current.dirty).toBe(true);
    // …and Discard returns to what was actually saved.
    applied.length = 0;
    act(() => view.result.current.discard());
    expect(applied).toEqual([SAVED]);
  });

  it('drops a draft whose record moved on rather than pasting stale edits over it', () => {
    writeDraft(KEY, SAVED, EDITED);
    const movedOn = { name: 'revenue', layout: { title: 'SOMEONE ELSE SAVED THIS' } };

    const { view, applied, seedWith } = setupForm();
    seedWith(movedOn);

    expect(applied[applied.length - 1]).toEqual(movedOn);
    expect(view.result.current.dirty).toBe(false);
    expect(readDraft(KEY)).toBeNull();
  });

  it('clears the draft when Discard reverts the form', () => {
    const { view, applied, seedWith } = setupForm();
    seedWith(SAVED);
    view.rerender({ values: EDITED });
    expect(readDraft(KEY)).not.toBeNull();

    act(() => view.result.current.discard());
    view.rerender({ values: applied[applied.length - 1] }); // back to SAVED
    expect(readDraft(KEY)).toBeNull();
  });

  it('clears the draft when a save advances the baseline', () => {
    const { view, seedWith } = setupForm();
    seedWith(SAVED);
    view.rerender({ values: EDITED });
    expect(readDraft(KEY)).not.toBeNull();

    // A save persists EDITED; the store's optimistic write re-seeds the form.
    seedWith(EDITED);
    expect(view.result.current.dirty).toBe(false);
    expect(readDraft(KEY)).toBeNull();
  });

  it('a corrupt stored draft is discarded, leaving the form on the saved record', () => {
    // The failure rule end-to-end: nothing surfaces to the user but the saved
    // values, and the bad entry is gone.
    window.localStorage.setItem(`visivo.draft.local.${KEY}`, '{{ not json');
    const { view, applied, seedWith } = setupForm();
    seedWith(SAVED);

    expect(applied[applied.length - 1]).toEqual(SAVED);
    expect(view.result.current.dirty).toBe(false);
    expect(readDraft(KEY)).toBeNull();
  });
});
