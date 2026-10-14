/**
 * validateInsightJobStructure — the shape gate on insight artifacts fetched
 * from the server. Pins that a STATIC insight (VIS-1464: no files, no
 * post_query, only static_props) passes, while the pre-existing rejections
 * (missing name / files / query / props_mapping, malformed files) still hold.
 */
import { validateInsightJobStructure } from './insightJobs';

const QUERY_INSIGHT = {
  name: 'q',
  files: [{ name_hash: 'abc', signed_data_file_url: '/x.parquet' }],
  query: 'SELECT 1',
  props_mapping: { 'props.x': 'x' },
  static_props: {},
  type: 'scatter',
};

const STATIC_INSIGHT = {
  name: 'pixels',
  files: [],
  query: null,
  props_mapping: {},
  static_props: { z: [[[255, 0, 0]]] },
  props_slices: {},
  split_key: null,
  type: 'image',
};

describe('validateInsightJobStructure', () => {
  let warn;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('accepts a query-bound insight', () => {
    expect(validateInsightJobStructure(QUERY_INSIGHT)).toBe(true);
  });

  it('accepts a static insight with no files and no query', () => {
    expect(validateInsightJobStructure(STATIC_INSIGHT)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('still rejects a query-less insight that has nothing static to render', () => {
    expect(validateInsightJobStructure({ ...STATIC_INSIGHT, static_props: {} })).toBe(false);
    expect(validateInsightJobStructure({ ...STATIC_INSIGHT, static_props: null })).toBe(false);
    expect(validateInsightJobStructure({ ...STATIC_INSIGHT, static_props: 'nope' })).toBe(false);
  });

  it('still rejects a query-less insight that references files', () => {
    expect(
      validateInsightJobStructure({
        ...STATIC_INSIGHT,
        files: [{ name_hash: 'abc', signed_data_file_url: '/x.parquet' }],
      })
    ).toBe(false);
  });

  it('rejects missing name, files, props_mapping, and malformed files', () => {
    expect(validateInsightJobStructure({ ...QUERY_INSIGHT, name: '' })).toBe(false);
    expect(validateInsightJobStructure({ ...QUERY_INSIGHT, files: undefined })).toBe(false);
    expect(validateInsightJobStructure({ ...QUERY_INSIGHT, props_mapping: null })).toBe(false);
    expect(
      validateInsightJobStructure({ ...QUERY_INSIGHT, files: [{ name_hash: 'abc' }] })
    ).toBe(false);
    expect(
      validateInsightJobStructure({ ...QUERY_INSIGHT, files: [{ signed_data_file_url: '/x' }] })
    ).toBe(false);
  });
});
