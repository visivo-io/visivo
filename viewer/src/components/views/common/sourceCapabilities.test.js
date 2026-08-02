import {
  isLocalFileSource,
  canTestConnection,
} from './sourceCapabilities';

describe('isLocalFileSource', () => {
  it('is true for a duckdb or sqlite file path', () => {
    expect(isLocalFileSource({ type: 'duckdb', database: 'target/seeds/pie.duckdb' })).toBe(true);
    expect(isLocalFileSource({ type: 'sqlite', database: './local.db' })).toBe(true);
  });

  it('is false for a network source, whatever its database field says', () => {
    expect(isLocalFileSource({ type: 'postgresql', database: 'analytics' })).toBe(false);
    expect(isLocalFileSource({ type: 'snowflake', database: 'PROD' })).toBe(false);
  });

  it('is false for :memory: — there is no file to be missing', () => {
    expect(isLocalFileSource({ type: 'duckdb', database: ':memory:' })).toBe(false);
  });

  it('is false for a URI, which resolves the same from anywhere', () => {
    // MotherDuck, object storage and http all reach the same place from cloud
    // as from a laptop, so they are not "local" in the sense that matters.
    expect(isLocalFileSource({ type: 'duckdb', database: 'md:my_db' })).toBe(false);
    expect(isLocalFileSource({ type: 'duckdb', database: 's3://bucket/x.duckdb' })).toBe(false);
    expect(isLocalFileSource({ type: 'duckdb', database: 'https://h/x.duckdb' })).toBe(false);
  });

  it('is false when there is no database at all', () => {
    expect(isLocalFileSource({ type: 'duckdb' })).toBe(false);
    expect(isLocalFileSource({})).toBe(false);
    expect(isLocalFileSource()).toBe(false);
  });
});

describe('canTestConnection', () => {
  const LOCAL_FILE = { type: 'duckdb', database: 'target/seeds/pie.duckdb' };
  const REMOTE = { type: 'postgresql', database: 'analytics' };

  it('refuses a local-file source when the server has no local filesystem', () => {
    // The case that motivated this: in cloud the file was never uploaded, so
    // the test can only report a failure that says nothing about the config.
    expect(canTestConnection(LOCAL_FILE, { local_filesystem: false })).toBe(false);
  });

  it('allows it under visivo serve, where the file really is there', () => {
    expect(canTestConnection(LOCAL_FILE, { local_filesystem: true })).toBe(true);
  });

  it('always allows a network source', () => {
    expect(canTestConnection(REMOTE, { local_filesystem: false })).toBe(true);
  });

  it('allows the test while capabilities are still loading', () => {
    // Rather than flickering the control disabled on first paint. The request
    // may fail, which is no worse than today.
    expect(canTestConnection(LOCAL_FILE, null)).toBe(true);
  });

  it('allows it when an older server omits the flag entirely', () => {
    // Only an explicit `false` disables — an unknown server is assumed capable.
    expect(canTestConnection(LOCAL_FILE, { can_edit: true })).toBe(true);
  });
});
