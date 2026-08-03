/**
 * What a given source can actually do on the server that is serving us.
 *
 * A duckdb or sqlite source addressed by a filesystem path only resolves where
 * that path exists — the author's machine. Under `visivo serve` that is the same
 * machine, so everything works. In cloud the file was never uploaded, so the
 * runner reports
 *
 *   Cannot open database "/runner/target/seeds/pie_data.duckdb" ... does not exist
 *
 * and a connection test can only ever fail. Offering the button there invites a
 * failure that says nothing about the user's configuration.
 *
 * The server tells us which world we are in via the `local_filesystem`
 * capability rather than the client inferring it from some other flag.
 */

/** Source types addressed by a filesystem path rather than a network endpoint. */
const FILE_BACKED_TYPES = new Set(['duckdb', 'sqlite']);

/**
 * True when this source is backed by a file on the author's machine.
 *
 * `:memory:` is excluded (nothing on disk to be missing), as is anything with a
 * URI scheme — `md:` (MotherDuck), `s3://`, `https://` are all remote and
 * resolve the same from anywhere.
 */
export const isLocalFileSource = (config = {}) => {
  const type = String(config.type || '').toLowerCase();
  if (!FILE_BACKED_TYPES.has(type)) return false;

  const database = config.database;
  if (typeof database !== 'string' || !database) return false;
  if (database === ':memory:') return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(database)) return false;

  return true;
};

/**
 * Whether the serving process can open this source at all.
 *
 * One fact, two consumers: testing a connection and introspecting a schema both
 * require opening the database, and both fail the same way in cloud for a
 * file-backed source — the runner reports "database does not exist" because the
 * file is on the author's machine.
 *
 * @param {object} config - the source config
 * @param {object|null} capabilities - the project capabilities payload. While it
 *   is still loading we assume reachable rather than flickering controls
 *   disabled on first paint, and an older server that omits the flag keeps
 *   today's behaviour. Only an explicit `false` gates anything.
 */
export const canReachSource = (config, capabilities) => {
  if (!isLocalFileSource(config)) return true;
  if (!capabilities) return true;
  return capabilities.local_filesystem !== false;
};

/** Whether a connection test can meaningfully run for this source here. */
export const canTestConnection = canReachSource;

/** Whether a schema can be introspected for this source here. */
export const canGenerateSchema = canReachSource;

/** Why the test is unavailable, for the disabled control's tooltip. */
export const CONNECTION_TEST_UNAVAILABLE =
  'This source reads a file on your machine, which the cloud server cannot open. ' +
  'Test it with `visivo serve` locally.';

/** Why the schema cannot be generated here. */
export const SCHEMA_GENERATE_UNAVAILABLE =
  'This source reads a file on your machine, which the cloud server cannot open. ' +
  'Its schema is uploaded by `visivo deploy` — run and deploy locally to refresh it.';
