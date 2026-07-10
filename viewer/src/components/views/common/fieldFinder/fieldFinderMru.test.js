/**
 * fieldFinderMru — per-type MRU persistence (VIS-1021).
 */
import { readMru, bumpMru, clearMru, subscribeMru, __TEST__ } from './fieldFinderMru';

beforeEach(() => clearMru());

describe('fieldFinderMru', () => {
  it('starts empty for an unknown type', () => {
    expect(readMru('scatter')).toEqual([]);
    expect(readMru('')).toEqual([]);
  });

  it('bumps a path to the front, deduped, most-recent first', () => {
    bumpMru('scatter', 'line.dash');
    bumpMru('scatter', 'marker.color');
    bumpMru('scatter', 'line.dash'); // re-bump moves it back to front
    expect(readMru('scatter')).toEqual(['line.dash', 'marker.color']);
  });

  it('partitions MRU by type', () => {
    bumpMru('scatter', 'x');
    bumpMru('bar', 'orientation');
    expect(readMru('scatter')).toEqual(['x']);
    expect(readMru('bar')).toEqual(['orientation']);
  });

  it('caps the list at MAX_PER_TYPE', () => {
    for (let i = 0; i < __TEST__.MAX_PER_TYPE + 4; i += 1) bumpMru('scatter', `p${i}`);
    const list = readMru('scatter');
    expect(list).toHaveLength(__TEST__.MAX_PER_TYPE);
    // The most recently bumped is first.
    expect(list[0]).toBe(`p${__TEST__.MAX_PER_TYPE + 3}`);
  });

  it('ignores empty type/path', () => {
    bumpMru('', 'x');
    bumpMru('scatter', '');
    expect(readMru('scatter')).toEqual([]);
  });

  it('notifies same-tab subscribers on change', () => {
    const handler = jest.fn();
    const unsub = subscribeMru(handler);
    bumpMru('scatter', 'x');
    expect(handler).toHaveBeenCalled();
    unsub();
    handler.mockClear();
    bumpMru('scatter', 'y');
    expect(handler).not.toHaveBeenCalled();
  });

  it('survives corrupt storage without throwing', () => {
    window.localStorage.setItem(__TEST__.STORAGE_KEY, '{not json');
    expect(readMru('scatter')).toEqual([]);
    expect(() => bumpMru('scatter', 'x')).not.toThrow();
    expect(readMru('scatter')).toEqual(['x']);
  });
});
