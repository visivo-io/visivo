/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
/**
 * pivotDraft helpers (VIS-1008).
 *
 * The structured chip draft ⇆ ref-string (de)serialisation that PivotPlayground
 * relies on to seed from a saved table record and feed the pivot pipeline.
 */
import {
  parseFieldRefToChip,
  parseValueExprToChip,
  seedDraftFromRecord,
  serializeDraft,
  draftToPivotConfig,
  makeValueChip,
  DEFAULT_AGG,
} from './pivotDraft';

describe('pivotDraft', () => {
  test('parseFieldRefToChip parses ${ref(name).field} into a chip', () => {
    expect(parseFieldRefToChip('${ref(sales-insight).region}')).toEqual({
      field: 'region',
      source: 'sales-insight',
      label: 'Region',
    });
  });

  test('parseFieldRefToChip returns null for a non-ref string', () => {
    expect(parseFieldRefToChip('not a ref')).toBeNull();
    expect(parseFieldRefToChip(null)).toBeNull();
  });

  test('parseValueExprToChip extracts the aggregation + field', () => {
    expect(parseValueExprToChip('sum(${ref(s).revenue})')).toEqual({
      field: 'revenue',
      source: 's',
      label: 'Revenue',
      agg: 'sum',
    });
    expect(parseValueExprToChip('count_distinct(${ref(s).user_id})')).toEqual({
      field: 'user_id',
      source: 's',
      label: 'User Id',
      agg: 'count_distinct',
    });
  });

  test('parseValueExprToChip falls back to the default aggregation for an unknown function', () => {
    const chip = parseValueExprToChip('median(${ref(s).revenue})');
    expect(chip.agg).toBe(DEFAULT_AGG);
    expect(chip.field).toBe('revenue');
  });

  test('seedDraftFromRecord builds chip shelves from a table record config', () => {
    const draft = seedDraftFromRecord({
      columns: ['${ref(s).region}'],
      rows: ['${ref(s).category}'],
      values: ['avg(${ref(s).revenue})'],
    });
    expect(draft.columns).toEqual([{ field: 'region', source: 's', label: 'Region' }]);
    expect(draft.rows).toEqual([{ field: 'category', source: 's', label: 'Category' }]);
    expect(draft.values).toEqual([
      { field: 'revenue', source: 's', label: 'Revenue', agg: 'avg' },
    ]);
  });

  test('seedDraftFromRecord tolerates a record with no pivot config', () => {
    expect(seedDraftFromRecord({})).toEqual({ columns: [], rows: [], values: [] });
    expect(seedDraftFromRecord(null)).toEqual({ columns: [], rows: [], values: [] });
  });

  test('serializeDraft round-trips chips back into ref / agg-expression strings', () => {
    const draft = {
      columns: [{ field: 'region', source: 's', label: 'Region' }],
      rows: [{ field: 'category', source: 's', label: 'Category' }],
      values: [{ field: 'revenue', source: 's', label: 'Revenue', agg: 'sum' }],
    };
    expect(serializeDraft(draft)).toEqual({
      columns: ['${ref(s).region}'],
      rows: ['${ref(s).category}'],
      values: ['sum(${ref(s).revenue})'],
    });
  });

  test('seed → serialize is identity for a real pivot config', () => {
    const config = {
      columns: ['${ref(s).region}'],
      rows: ['${ref(s).category}'],
      values: ['avg(${ref(s).revenue})'],
    };
    expect(serializeDraft(seedDraftFromRecord(config))).toEqual(config);
  });

  test('draftToPivotConfig yields a pivot config when columns+values present (rows optional)', () => {
    const full = {
      columns: [{ field: 'region', source: 's' }],
      rows: [{ field: 'category', source: 's' }],
      values: [{ field: 'revenue', source: 's', agg: 'sum' }],
    };
    expect(draftToPivotConfig(full)).toEqual({
      columns: ['${ref(s).region}'],
      rows: ['${ref(s).category}'],
      values: ['sum(${ref(s).revenue})'],
    });

    // columns + values, NO rows → still a runnable pivot (single aggregated row).
    expect(
      draftToPivotConfig({
        columns: [{ field: 'category', source: 's' }],
        rows: [],
        values: [
          { field: 'value', source: 's', agg: 'sum' },
          { field: 'value', source: 's', agg: 'count' },
        ],
      })
    ).toEqual({
      columns: ['${ref(s).category}'],
      rows: [],
      values: ['sum(${ref(s).value})', 'count(${ref(s).value})'],
    });

    // columns only → column-select config
    expect(draftToPivotConfig({ columns: [{ field: 'region', source: 's' }], rows: [], values: [] })).toEqual({
      columns: ['${ref(s).region}'],
    });

    // partial (columns + rows, no values) → not runnable
    expect(
      draftToPivotConfig({
        columns: [{ field: 'region', source: 's' }],
        rows: [{ field: 'category', source: 's' }],
        values: [],
      })
    ).toBeNull();

    // values but no pivot column → not runnable (a pivot needs a column to pivot ON)
    expect(
      draftToPivotConfig({
        columns: [],
        rows: [{ field: 'category', source: 's' }],
        values: [{ field: 'value', source: 's', agg: 'sum' }],
      })
    ).toBeNull();

    // empty → null
    expect(draftToPivotConfig({ columns: [], rows: [], values: [] })).toBeNull();
  });

  test('makeValueChip defaults the aggregation to sum', () => {
    expect(makeValueChip({ field: 'revenue', source: 's', label: 'Revenue' })).toEqual({
      field: 'revenue',
      source: 's',
      label: 'Revenue',
      agg: DEFAULT_AGG,
    });
  });
});
