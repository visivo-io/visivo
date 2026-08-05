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

/** Drive the hook with a spy `apply` so we can see what it pushes back. */
const setup = () => {
  const applied = [];
  const apply = values => applied.push(values);
  const view = renderHook(() => useFormBaseline(apply));
  return { view, applied };
};

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
