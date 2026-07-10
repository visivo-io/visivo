/* eslint-disable no-template-curly-in-string -- fixtures assert literal Visivo `${ref(...)}` strings */
/**
 * itemMutations tests (VIS-993 §3).
 *
 * The single module through which dashboard Item/Row configs are created and
 * mutated. Every helper's output must be BORN backend-valid — no empty-string
 * leaf fields, no non-model `selector` key, at most one leaf/container field
 * set, integer widths — so `sanitizeDashboardConfig` has nothing to paper
 * over and can be retired. The "born-valid guarantee" block proves each
 * helper's output against the REAL bundled project schema via
 * validateRecordConfig('item'|'row', …).
 */
import {
  LEAF_REF_FIELDS,
  createEmptyItem,
  createRow,
  setItemLeaf,
  clearItemLeaf,
  applyLeafRef,
  convertItemToContainer,
  convertItemToLeaf,
  appendEmptyItem,
  setItemWidth,
  checkLeafExclusivity,
} from './itemMutations';
import { validateRecordConfig, clearValidationCache } from './validateAgainstSchema';

// The legacy hand-rolled scaffold the right-rail forms used to produce — the
// exact shape sanitizeDashboardConfig existed to clean up (GAP-3).
const LEGACY_SCAFFOLD = {
  width: 2,
  chart: '',
  table: '',
  markdown: '',
  input: '',
  selector: '',
};

describe('LEAF_REF_FIELDS', () => {
  test('is the 4 mutually-exclusive leaf ref fields', () => {
    expect(LEAF_REF_FIELDS).toEqual(['chart', 'table', 'markdown', 'input']);
  });
});

describe('createEmptyItem', () => {
  test('defaults to a bare { width: 1 } slot — NO empty-string leaf keys, NO selector', () => {
    expect(createEmptyItem()).toEqual({ width: 1 });
  });

  test('accepts an explicit width', () => {
    expect(createEmptyItem(3)).toEqual({ width: 3 });
  });

  test('normalizes a non-integer / bogus width to a valid integer', () => {
    expect(createEmptyItem('4')).toEqual({ width: 4 });
    expect(createEmptyItem('')).toEqual({ width: 1 });
    expect(createEmptyItem(0)).toEqual({ width: 1 });
    expect(createEmptyItem(-2)).toEqual({ width: 1 });
    expect(createEmptyItem(4.6)).toEqual({ width: 5 });
  });
});

describe('createRow', () => {
  test('creates a medium row holding ONE empty slot (never an empty items array)', () => {
    expect(createRow()).toEqual({ height: 'medium', items: [{ width: 1 }] });
  });

  test('accepts a height override', () => {
    expect(createRow({ height: 'small' })).toEqual({
      height: 'small',
      items: [{ width: 1 }],
    });
  });

  test('accepts a slot width override', () => {
    expect(createRow({ width: 6 })).toEqual({ height: 'medium', items: [{ width: 6 }] });
  });
});

describe('setItemLeaf', () => {
  test('writes the leaf as a ${ref(name)} expression (formatRefExpression form)', () => {
    const next = setItemLeaf({ width: 1 }, 'chart', 'rev_chart');
    expect(next).toEqual({ width: 1, chart: '${ref(rev_chart)}' });
  });

  test('clears the competing leaf key when switching types (mutual exclusion)', () => {
    const chartItem = { width: 2, chart: '${ref(rev_chart)}' };
    const next = setItemLeaf(chartItem, 'table', 'sales_table');
    expect(next).toEqual({ width: 2, table: '${ref(sales_table)}' });
    expect('chart' in next).toBe(false);
  });

  test('clears a container (Item.rows) when writing a leaf (mutual exclusion)', () => {
    const container = { width: 1, rows: [createRow()] };
    const next = setItemLeaf(container, 'markdown', 'notes');
    expect(next).toEqual({ width: 1, markdown: '${ref(notes)}' });
    expect('rows' in next).toBe(false);
  });

  test('strips every legacy empty-string leaf + the non-model selector key', () => {
    const next = setItemLeaf(LEGACY_SCAFFOLD, 'input', 'date_input');
    expect(next).toEqual({ width: 2, input: '${ref(date_input)}' });
    ['chart', 'table', 'markdown', 'selector'].forEach(k => expect(k in next).toBe(false));
  });

  test('normalizes a string width so the output is integer-typed', () => {
    const next = setItemLeaf({ width: '3', chart: '' }, 'chart', 'c');
    expect(next.width).toBe(3);
  });

  test('an unknown leaf type degrades to a cleared slot (never an invalid key)', () => {
    expect(setItemLeaf({ width: 1 }, 'selector', 'x')).toEqual({ width: 1 });
    expect(setItemLeaf({ width: 1 }, 'bogus', 'x')).toEqual({ width: 1 });
  });

  test('a blank / missing name degrades to a cleared slot (never an empty-string leaf)', () => {
    expect(setItemLeaf({ width: 1, chart: '${ref(a)}' }, 'chart', '')).toEqual({ width: 1 });
    expect(setItemLeaf({ width: 1 }, 'chart', '   ')).toEqual({ width: 1 });
    expect(setItemLeaf({ width: 1 }, 'chart', null)).toEqual({ width: 1 });
  });

  test('does not mutate the input item', () => {
    const item = { width: 1, chart: '${ref(a)}' };
    setItemLeaf(item, 'table', 't');
    expect(item).toEqual({ width: 1, chart: '${ref(a)}' });
  });

  test('tolerates a nullish item (creates the slot around the leaf)', () => {
    expect(setItemLeaf(null, 'chart', 'c')).toEqual({ width: 1, chart: '${ref(c)}' });
  });
});

describe('clearItemLeaf', () => {
  test('drops every leaf field + rows + selector, preserving width', () => {
    const next = clearItemLeaf({ ...LEGACY_SCAFFOLD, rows: [createRow()] });
    expect(next).toEqual({ width: 2 });
  });

  test('preserves an item without width as width-less (backend default applies)', () => {
    expect(clearItemLeaf({ chart: '${ref(a)}' })).toEqual({});
  });

  test('normalizes a string width', () => {
    expect(clearItemLeaf({ width: '5', chart: '${ref(a)}' })).toEqual({ width: 5 });
  });

  test('tolerates nullish input (yields an empty slot)', () => {
    expect(clearItemLeaf(null)).toEqual({ width: 1 });
    expect(clearItemLeaf(undefined)).toEqual({ width: 1 });
  });

  test('does not mutate the input item', () => {
    const item = { width: 1, chart: '${ref(a)}' };
    clearItemLeaf(item);
    expect(item).toEqual({ width: 1, chart: '${ref(a)}' });
  });
});

describe('applyLeafRef', () => {
  test('a { type, name } ref sets the leaf', () => {
    expect(applyLeafRef({ width: 1 }, { type: 'chart', name: 'rev' })).toEqual({
      width: 1,
      chart: '${ref(rev)}',
    });
  });

  test('null / partial refs clear the leaf', () => {
    const item = { width: 2, chart: '${ref(a)}' };
    expect(applyLeafRef(item, null)).toEqual({ width: 2 });
    expect(applyLeafRef(item, { type: 'chart' })).toEqual({ width: 2 });
    expect(applyLeafRef(item, { name: 'a' })).toEqual({ width: 2 });
  });
});

describe('convertItemToContainer / convertItemToLeaf', () => {
  test('to container: keeps the slot width, seeds ONE valid nested row, drops the leaf', () => {
    const next = convertItemToContainer({ width: 4, chart: '${ref(a)}' });
    expect(next).toEqual({ width: 4, rows: [{ height: 'medium', items: [{ width: 1 }] }] });
  });

  test('to container: defaults width to 1 and normalizes string widths', () => {
    expect(convertItemToContainer(undefined).width).toBe(1);
    expect(convertItemToContainer({ width: '2' }).width).toBe(2);
  });

  test('to container: strips legacy empty-string leaves + selector', () => {
    const next = convertItemToContainer(LEGACY_SCAFFOLD);
    expect(Object.keys(next).sort()).toEqual(['rows', 'width']);
  });

  test('to leaf: collapses to a bare empty slot preserving width', () => {
    expect(convertItemToLeaf({ width: 3, rows: [createRow()] })).toEqual({ width: 3 });
    expect(convertItemToLeaf({ rows: [] })).toEqual({ width: 1 });
    expect(convertItemToLeaf(undefined)).toEqual({ width: 1 });
  });
});

describe('appendEmptyItem', () => {
  test('appends one empty slot to the row (existing items untouched)', () => {
    const row = { height: 'small', items: [{ width: 2, chart: '${ref(a)}' }] };
    const next = appendEmptyItem(row);
    expect(next).toEqual({
      height: 'small',
      items: [{ width: 2, chart: '${ref(a)}' }, { width: 1 }],
    });
    // Immutability: the original row/items are untouched.
    expect(row.items).toHaveLength(1);
  });

  test('seeds the items array when the row has none', () => {
    expect(appendEmptyItem({ height: 'medium' })).toEqual({
      height: 'medium',
      items: [{ width: 1 }],
    });
  });

  test('tolerates a nullish row (yields a fresh valid row)', () => {
    expect(appendEmptyItem(null)).toEqual({ height: 'medium', items: [{ width: 1 }] });
  });
});

describe('setItemWidth', () => {
  test('writes an integer width, preserving the leaf', () => {
    expect(setItemWidth({ width: 1, chart: '${ref(a)}' }, '4')).toEqual({
      width: 4,
      chart: '${ref(a)}',
    });
  });

  test('normalizes blank / bogus / sub-1 input to a valid width', () => {
    expect(setItemWidth({ width: 3 }, '')).toEqual({ width: 1 });
    expect(setItemWidth({ width: 3 }, 'abc')).toEqual({ width: 1 });
    expect(setItemWidth({ width: 3 }, 0)).toEqual({ width: 1 });
    expect(setItemWidth({ width: 3 }, 4.4)).toEqual({ width: 4 });
  });

  test('tolerates a nullish item', () => {
    expect(setItemWidth(null, 5)).toEqual({ width: 5 });
  });

  test('strips legacy blank leaf keys + selector while preserving the real leaf', () => {
    expect(setItemWidth(LEGACY_SCAFFOLD, 4)).toEqual({ width: 4 });
    expect(setItemWidth({ width: 1, chart: '${ref(a)}', table: '', selector: '' }, 4)).toEqual({
      width: 4,
      chart: '${ref(a)}',
    });
  });

  test('does not mutate the input item', () => {
    const item = { width: 1 };
    setItemWidth(item, 9);
    expect(item).toEqual({ width: 1 });
  });
});

// ── checkLeafExclusivity: the semantic half of the structure gate ────────────
// The backend's `validate_unique_item_types` (>1 of chart/table/markdown/input/
// rows set → 400) is a Pydantic model_validator with NO JSON-schema encoding,
// so the AJV gate alone cannot catch it. This companion check mirrors the
// backend's `is not None` semantics exactly (an empty string COUNTS as set).
describe('checkLeafExclusivity', () => {
  test('passes a valid dashboard config (single leaves, empty slots, containers)', () => {
    const config = {
      name: 'd',
      rows: [
        { height: 'medium', items: [{ width: 1, chart: '${ref(a)}' }, { width: 1 }] },
        { height: 'small', items: [{ width: 1, rows: [createRow()] }] },
      ],
    };
    expect(checkLeafExclusivity(config)).toEqual({ valid: true, errors: [] });
  });

  test('flags an item with TWO leaf types set, at its dotted path', () => {
    const config = {
      rows: [
        {
          items: [
            { width: 1, chart: '${ref(a)}' },
            { width: 1, chart: '${ref(a)}', table: '${ref(b)}' },
          ],
        },
      ],
    };
    const result = checkLeafExclusivity(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].path).toBe('rows.0.items.1');
    expect(result.errors[0].keyword).toBe('exclusive');
    expect(result.errors[0].message).toMatch(/only one of/i);
  });

  test('an empty STRING counts as set (backend `is not None` parity)', () => {
    const config = { rows: [{ items: [{ width: 1, chart: '', table: '' }] }] };
    expect(checkLeafExclusivity(config).valid).toBe(false);
  });

  test('a leaf set alongside rows counts as two (rows shares the exclusion)', () => {
    const config = {
      rows: [{ items: [{ width: 1, chart: '${ref(a)}', rows: [] }] }],
    };
    expect(checkLeafExclusivity(config).valid).toBe(false);
  });

  test('recurses into nested container rows', () => {
    const config = {
      rows: [
        {
          items: [
            {
              width: 1,
              rows: [{ items: [{ width: 1, markdown: '${ref(m)}', input: '${ref(i)}' }] }],
            },
          ],
        },
      ],
    };
    const result = checkLeafExclusivity(config);
    expect(result.valid).toBe(false);
    expect(result.errors[0].path).toBe('rows.0.items.0.rows.0.items.0');
  });

  test('fails open on nullish / rows-less / malformed configs', () => {
    expect(checkLeafExclusivity(null).valid).toBe(true);
    expect(checkLeafExclusivity({}).valid).toBe(true);
    expect(checkLeafExclusivity({ rows: 'nope' }).valid).toBe(true);
    expect(checkLeafExclusivity({ rows: [{ items: null }, null] }).valid).toBe(true);
  });
});

// ── The point of the module: every output passes the REAL backend schema ────
describe('born-valid guarantee (validated against the real project schema)', () => {
  beforeAll(() => clearValidationCache());

  const expectValid = async (type, config) => {
    const result = await validateRecordConfig(type, config);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    // A skipped result would be a vacuous pass — the def must really exist.
    expect(result.skipped).toBeUndefined();
  };

  test('createEmptyItem output validates as an Item', async () => {
    await expectValid('item', createEmptyItem());
    await expectValid('item', createEmptyItem('7'));
  });

  test('createRow output validates as a Row', async () => {
    await expectValid('row', createRow());
    await expectValid('row', createRow({ height: 'xlarge', width: 4 }));
  });

  test('setItemLeaf output validates for every leaf type — even from the legacy scaffold', async () => {
    for (const type of LEAF_REF_FIELDS) {
      await expectValid('item', setItemLeaf(createEmptyItem(), type, 'some_object'));
      await expectValid('item', setItemLeaf(LEGACY_SCAFFOLD, type, 'some_object'));
    }
  });

  test('clearItemLeaf / applyLeafRef(null) outputs validate as an Item', async () => {
    await expectValid('item', clearItemLeaf(LEGACY_SCAFFOLD));
    await expectValid('item', applyLeafRef({ width: 2, table: '${ref(t)}' }, null));
  });

  test('container round-trip outputs validate as an Item', async () => {
    const container = convertItemToContainer({ width: 2, chart: '${ref(a)}' });
    await expectValid('item', container);
    await expectValid('item', convertItemToLeaf(container));
  });

  test('appendEmptyItem output validates as a Row', async () => {
    await expectValid('row', appendEmptyItem(createRow()));
    await expectValid('row', appendEmptyItem({ height: 'small' }));
  });

  test('setItemWidth output validates as an Item (string input included)', async () => {
    await expectValid('item', setItemWidth(createEmptyItem(), '11'));
    await expectValid('item', setItemWidth({ chart: '${ref(a)}' }, ''));
    await expectValid('item', setItemWidth(LEGACY_SCAFFOLD, 4));
  });
});
