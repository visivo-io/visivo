/**
 * runFailures tests (VIS-993 §2 / VIS-981) — per-record run-failure selection.
 *
 * Runs arrive in the cloud Run shape:
 *   { id, state, dag_filter, error_json, is_superseded, created_at, updated_at }
 * where dag_filter carries `+name+`-joined object names
 * (e.g. "+revenue_insight+,+orders_model+").
 */
import {
  parseDagFilterNames,
  extractRunError,
  findLatestRunFailureFor,
  selectLatestRunFailureFor,
} from './runFailures';

describe('parseDagFilterNames', () => {
  it('strips + wrappers and splits on commas', () => {
    expect(parseDagFilterNames('+revenue_insight+,+orders_model+')).toEqual([
      'revenue_insight',
      'orders_model',
    ]);
  });

  it('tolerates whitespace around separators and names', () => {
    expect(parseDagFilterNames(' +a+ , +b+ ')).toEqual(['a', 'b']);
  });

  it('passes through names without + wrappers', () => {
    expect(parseDagFilterNames('plain_name')).toEqual(['plain_name']);
  });

  it('drops empty segments', () => {
    expect(parseDagFilterNames('+a+,,+b+')).toEqual(['a', 'b']);
  });

  it('returns [] for empty / non-string input', () => {
    expect(parseDagFilterNames('')).toEqual([]);
    expect(parseDagFilterNames('   ')).toEqual([]);
    expect(parseDagFilterNames(null)).toEqual([]);
    expect(parseDagFilterNames(undefined)).toEqual([]);
    expect(parseDagFilterNames(42)).toEqual([]);
  });
});

describe('extractRunError', () => {
  it('prefers message, then error, then detail on objects', () => {
    expect(extractRunError({ message: 'obj boom' })).toBe('obj boom');
    expect(extractRunError({ error: 'err boom' })).toBe('err boom');
    expect(extractRunError({ detail: 'det boom' })).toBe('det boom');
    expect(extractRunError({ message: 'wins', error: 'loses' })).toBe('wins');
  });

  it('stringifies objects without a known message key', () => {
    expect(extractRunError({ code: 500 })).toBe('{"code":500}');
  });

  it('parses a JSON-encoded string payload', () => {
    expect(extractRunError('{"message":"parsed boom"}')).toBe('parsed boom');
  });

  it('uses a malformed JSON string as the message itself', () => {
    expect(extractRunError('{invalid json')).toBe('{invalid json');
    expect(extractRunError('query exploded')).toBe('query exploded');
  });

  it('keeps a JSON string that parses to a non-object as the raw message', () => {
    expect(extractRunError('42')).toBe('42');
  });

  it('falls back for null / undefined / empty payloads', () => {
    expect(extractRunError(null)).toBe('Run failed');
    expect(extractRunError(undefined)).toBe('Run failed');
    expect(extractRunError('')).toBe('Run failed');
    expect(extractRunError('   ')).toBe('Run failed');
  });

  it('falls back for an unstringifiable (circular) object payload', () => {
    const circular = {};
    circular.self = circular;
    expect(extractRunError(circular)).toBe('Run failed');
  });

  it('stringifies non-object, non-string payloads', () => {
    expect(extractRunError(500)).toBe('500');
  });
});

describe('findLatestRunFailureFor', () => {
  const failed = (over = {}) => ({
    id: 'run-failed',
    state: 'failed',
    dag_filter: '+revenue_insight+,+orders_model+',
    error_json: '{"message":"query exploded"}',
    is_superseded: false,
    created_at: '2026-07-01T12:00:00Z',
    ...over,
  });
  const succeeded = (over = {}) => ({
    id: 'run-succeeded',
    state: 'succeeded',
    dag_filter: '+revenue_insight+',
    error_json: null,
    is_superseded: false,
    created_at: '2026-07-01T13:00:00Z',
    ...over,
  });

  it('returns null for missing runs / name', () => {
    expect(findLatestRunFailureFor(undefined, 'revenue_insight')).toBeNull();
    expect(findLatestRunFailureFor([], 'revenue_insight')).toBeNull();
    expect(findLatestRunFailureFor([failed()], '')).toBeNull();
    expect(findLatestRunFailureFor([failed()], null)).toBeNull();
  });

  it('surfaces the latest failed run whose dag_filter includes the name', () => {
    expect(findLatestRunFailureFor([failed()], 'revenue_insight')).toEqual({
      runId: 'run-failed',
      error: 'query exploded',
      createdAt: '2026-07-01T12:00:00Z',
    });
    // Also matches the OTHER name in the same dag_filter.
    expect(findLatestRunFailureFor([failed()], 'orders_model')).not.toBeNull();
  });

  it('returns null when no failed run mentions the name', () => {
    expect(findLatestRunFailureFor([failed()], 'unrelated_chart')).toBeNull();
  });

  it('skips superseded runs entirely', () => {
    expect(
      findLatestRunFailureFor([failed({ is_superseded: true })], 'revenue_insight')
    ).toBeNull();
    // A superseded newest failure falls back to the older live one.
    const older = failed({ id: 'run-old', created_at: '2026-07-01T10:00:00Z' });
    const newerSuperseded = failed({ id: 'run-new', is_superseded: true });
    expect(
      findLatestRunFailureFor([newerSuperseded, older], 'revenue_insight')
    ).toMatchObject({ runId: 'run-old' });
  });

  it('clears when a NEWER succeeded run also mentions the name', () => {
    expect(findLatestRunFailureFor([succeeded(), failed()], 'revenue_insight')).toBeNull();
  });

  it('does NOT clear when the newer succeeded run mentions a different name', () => {
    const otherSuccess = succeeded({ dag_filter: '+unrelated_chart+' });
    expect(
      findLatestRunFailureFor([otherSuccess, failed()], 'revenue_insight')
    ).toMatchObject({ runId: 'run-failed' });
  });

  it('an OLDER succeeded run does not clear a newer failure', () => {
    const oldSuccess = succeeded({ created_at: '2026-07-01T09:00:00Z' });
    expect(
      findLatestRunFailureFor([failed(), oldSuccess], 'revenue_insight')
    ).toMatchObject({ runId: 'run-failed' });
  });

  it('a newer queued/running run neither clears nor replaces the failure', () => {
    const inflight = {
      id: 'run-live',
      state: 'running',
      dag_filter: '+revenue_insight+',
      is_superseded: false,
      created_at: '2026-07-01T14:00:00Z',
    };
    expect(
      findLatestRunFailureFor([inflight, failed()], 'revenue_insight')
    ).toMatchObject({ runId: 'run-failed' });
  });

  it('orders by created_at when the array is not newest-first', () => {
    // Failure is FIRST in the array but OLDER than the success — must clear.
    expect(findLatestRunFailureFor([failed(), succeeded()], 'revenue_insight')).toBeNull();
  });

  it('extracts the error defensively (object payloads, missing error_json)', () => {
    expect(
      findLatestRunFailureFor([failed({ error_json: { message: 'obj boom' } })], 'orders_model')
    ).toMatchObject({ error: 'obj boom' });
    expect(
      findLatestRunFailureFor([failed({ error_json: null })], 'orders_model')
    ).toMatchObject({ error: 'Run failed' });
  });

  it('selectLatestRunFailureFor reads state.runs', () => {
    const selector = selectLatestRunFailureFor('revenue_insight');
    expect(selector({ runs: [failed()] })).toMatchObject({ runId: 'run-failed' });
    expect(selector({ runs: [] })).toBeNull();
    expect(selector({})).toBeNull();
    expect(selector(undefined)).toBeNull();
  });
});
