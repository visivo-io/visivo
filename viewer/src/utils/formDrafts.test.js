/**
 * formDrafts — per-object unsaved-edit persistence.
 *
 * Two rules carry the weight here:
 *   - STALENESS: a draft only restores while the saved values it was taken
 *     against still match, so unsaved edits are never pasted over a record that
 *     moved on underneath (a concurrent save, a run, another project's
 *     same-named object).
 *   - FAILURE: any problem loading a draft CLEARS that object's entry and
 *     reports "no draft" — a corrupt entry never surfaces as a broken form and
 *     never lingers to fail again.
 */
import {
  clearDraft,
  draftStorageKey,
  readDraft,
  restoreDraft,
  syncDraft,
  writeDraft,
} from './formDrafts';

beforeEach(() => {
  window.localStorage.clear();
  jest.restoreAllMocks();
});

describe('formDrafts — round trip', () => {
  it('writes and reads back a draft', () => {
    writeDraft('chart:revenue', { name: 'revenue' }, { name: 'revenue_edited' });
    expect(readDraft('chart:revenue')).toEqual({
      baseline: { name: 'revenue' },
      values: { name: 'revenue_edited' },
    });
  });

  it('returns null when nothing is stored', () => {
    expect(readDraft('chart:nothing')).toBeNull();
  });

  it('clearDraft removes the entry', () => {
    writeDraft('chart:revenue', { a: 1 }, { a: 2 });
    clearDraft('chart:revenue');
    expect(readDraft('chart:revenue')).toBeNull();
  });

  it('namespaces keys so an unrelated localStorage entry is never touched', () => {
    window.localStorage.setItem('chart:revenue', 'someone-elses-value');
    writeDraft('chart:revenue', { a: 1 }, { a: 2 });
    expect(window.localStorage.getItem('chart:revenue')).toBe('someone-elses-value');
    expect(draftStorageKey('chart:revenue')).toContain('visivo.draft.');
  });

  it('keeps drafts for different objects independent', () => {
    writeDraft('chart:a', { n: 'a' }, { n: 'a2' });
    writeDraft('chart:b', { n: 'b' }, { n: 'b2' });
    expect(readDraft('chart:a').values).toEqual({ n: 'a2' });
    expect(readDraft('chart:b').values).toEqual({ n: 'b2' });
  });

  it('a falsy key is a no-op in every direction', () => {
    expect(readDraft('')).toBeNull();
    expect(() => writeDraft('', { a: 1 }, { a: 2 })).not.toThrow();
    expect(() => clearDraft('')).not.toThrow();
  });
});

describe('formDrafts — failure rule: any load error clears the object', () => {
  it('malformed JSON is cleared and reported as no draft', () => {
    window.localStorage.setItem(draftStorageKey('chart:revenue'), '{not json');
    expect(readDraft('chart:revenue')).toBeNull();
    // …and the bad entry is GONE, so it cannot fail again on the next open.
    expect(window.localStorage.getItem(draftStorageKey('chart:revenue'))).toBeNull();
  });

  it('an entry from an unknown version is cleared', () => {
    window.localStorage.setItem(
      draftStorageKey('chart:revenue'),
      JSON.stringify({ v: 999, baseline: {}, values: {} })
    );
    expect(readDraft('chart:revenue')).toBeNull();
    expect(window.localStorage.getItem(draftStorageKey('chart:revenue'))).toBeNull();
  });

  it('an entry missing the baseline/values shape is cleared', () => {
    window.localStorage.setItem(
      draftStorageKey('chart:revenue'),
      JSON.stringify({ v: 1, values: { a: 1 } }) // no baseline
    );
    expect(readDraft('chart:revenue')).toBeNull();
    expect(window.localStorage.getItem(draftStorageKey('chart:revenue'))).toBeNull();
  });

  it('a non-object payload (bare string/null) is cleared', () => {
    window.localStorage.setItem(draftStorageKey('chart:revenue'), JSON.stringify('nope'));
    expect(readDraft('chart:revenue')).toBeNull();
    expect(window.localStorage.getItem(draftStorageKey('chart:revenue'))).toBeNull();
  });

  it('a throwing getItem clears the entry instead of propagating', () => {
    writeDraft('chart:revenue', { a: 1 }, { a: 2 });
    const removeSpy = jest.spyOn(Storage.prototype, 'removeItem');
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(readDraft('chart:revenue')).toBeNull();
    expect(removeSpy).toHaveBeenCalled();
  });

  it('a failed write (quota) clears rather than leaving a half-written entry', () => {
    writeDraft('chart:revenue', { a: 1 }, { a: 2 });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    writeDraft('chart:revenue', { a: 1 }, { a: 3 });
    jest.restoreAllMocks();
    expect(readDraft('chart:revenue')).toBeNull();
  });

  it('a circular value cannot be stored and leaves no entry behind', () => {
    const circular = { name: 'x' };
    circular.self = circular;
    expect(() => writeDraft('chart:revenue', { name: 'x' }, circular)).not.toThrow();
    expect(readDraft('chart:revenue')).toBeNull();
  });
});

describe('formDrafts — staleness rule (restoreDraft)', () => {
  const saved = { name: 'revenue', layout: { title: 'Q1' } };

  it('restores the unsaved values when the saved record has not moved on', () => {
    writeDraft('chart:revenue', saved, { ...saved, layout: { title: 'EDITED' } });
    expect(restoreDraft('chart:revenue', { ...saved })).toEqual({
      ...saved,
      layout: { title: 'EDITED' },
    });
  });

  it('drops the draft when the saved record changed underneath', () => {
    writeDraft('chart:revenue', saved, { ...saved, layout: { title: 'EDITED' } });
    const movedOn = { name: 'revenue', layout: { title: 'SOMEONE ELSE SAVED THIS' } };
    expect(restoreDraft('chart:revenue', movedOn)).toBe(movedOn);
    // Dropped, not just skipped — it can never resurface.
    expect(readDraft('chart:revenue')).toBeNull();
  });

  it('returns the saved values unchanged (same reference) when there is no draft', () => {
    const values = { ...saved };
    expect(restoreDraft('chart:revenue', values)).toBe(values);
  });

  it('with no key it is a pass-through', () => {
    const values = { ...saved };
    expect(restoreDraft(undefined, values)).toBe(values);
  });
});

describe('formDrafts — syncDraft mirrors edit state', () => {
  it('stores while the values differ from the baseline', () => {
    syncDraft('chart:revenue', { n: 1 }, { n: 2 });
    expect(readDraft('chart:revenue')).toEqual({ baseline: { n: 1 }, values: { n: 2 } });
  });

  it('removes the draft the moment the values match the baseline again', () => {
    syncDraft('chart:revenue', { n: 1 }, { n: 2 });
    // A save advances the baseline, or Discard reverts — either way: clean.
    syncDraft('chart:revenue', { n: 2 }, { n: 2 });
    expect(readDraft('chart:revenue')).toBeNull();
  });

  it('is a no-op before a baseline exists (a form mid-mount stores nothing)', () => {
    syncDraft('chart:revenue', null, { n: 2 });
    syncDraft('chart:revenue', undefined, { n: 2 });
    expect(readDraft('chart:revenue')).toBeNull();
  });
});
