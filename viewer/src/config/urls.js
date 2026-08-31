/**
 * Centralized URL configuration system for Visivo viewer
 * Supports different environments (server, dist) with configurable host and deployment root
 */

// URL patterns for different environments
const URL_PATTERNS = {
  // Every value is a PATH TEMPLATE, not an operation — `{...}` segments are
  // filled by getUrl(). Two operations on one path (list + create) share one
  // key, because the map has nothing to say about verbs.
  //
  // Grouped by shape so an outlier is visible as an outlier. A resource that
  // does not have `<plural>/` + `<plural>/{name}/` is either genuinely special
  // or drift, and the grouping is what makes you ask which.
  server: {
    // ---- CRUD resources -------------------------------------------------
    // Uniform: list / detail / validate on `/api/<plural>/`. If you are adding
    // a resource, it belongs here and it should need no comment.
    sourcesList: '/api/sources/',
    sourceDetail: '/api/sources/{name}/',
    sourceValidate: '/api/sources/{name}/validate/',
    // Connection tests are their own collection: the credentials being tested
    // may not belong to a saved source yet, so there is no {name} to nest
    // under. POST starts a job; its detail hangs off this path with the job id
    // appended, which is what runOnDemandJob does.
    sourceConnections: '/api/source-connections/',

    modelsList: '/api/models/',
    modelDetail: '/api/models/{name}/',
    modelValidate: '/api/models/{name}/validate/',
    // OUTLIER: a sub-action on the detail route — drops the cached profile.
    modelProfileInvalidate: '/api/models/{name}/profile/invalidate/',

    dimensionsList: '/api/dimensions/',
    dimensionDetail: '/api/dimensions/{name}/',
    dimensionValidate: '/api/dimensions/{name}/validate/',

    metricsList: '/api/metrics/',
    metricDetail: '/api/metrics/{name}/',
    metricValidate: '/api/metrics/{name}/validate/',

    relationsList: '/api/relations/',
    relationDetail: '/api/relations/{name}/',
    relationValidate: '/api/relations/{name}/validate/',

    insightsList: '/api/insights/',
    insightDetail: '/api/insights/{name}/',
    insightValidate: '/api/insights/{name}/validate/',

    inputsList: '/api/inputs/',
    inputDetail: '/api/inputs/{name}/',
    inputValidate: '/api/inputs/{name}/validate/',

    markdownsList: '/api/markdowns/',
    markdownDetail: '/api/markdowns/{name}/',
    markdownValidate: '/api/markdowns/{name}/validate/',

    chartsList: '/api/charts/',
    chartDetail: '/api/charts/{name}/',
    chartValidate: '/api/charts/{name}/validate/',

    tablesList: '/api/tables/',
    tableDetail: '/api/tables/{name}/',
    tableValidate: '/api/tables/{name}/validate/',

    projectsList: '/api/projects/',
    projectDetail: '/api/projects/{name}/',
    projectValidate: '/api/projects/{name}/validate/',

    // OUTLIER: dashboards carry an explicit `/delete/` sub-path instead of
    // DELETE on the detail route, and `dashboardSave` is the detail route under
    // a second name. Every other resource above deletes via its detail route.
    dashboardsList: '/api/dashboards/',
    dashboardSave: '/api/dashboards/{name}/',
    dashboardDelete: '/api/dashboards/{name}/delete/',
    dashboardValidate: '/api/dashboards/{name}/validate/',

    // OUTLIER: a singleton — no list, no name. Correct, since a project has
    // exactly one defaults document.
    defaults: '/api/defaults/',

    // Explorations are per-user scratch state, keyed by id rather than name
    // (two users' explorations can share a name), and carry two sub-actions
    // that are state transitions rather than edits.
    explorationsList: '/api/explorations/',
    explorationDetail: '/api/explorations/{id}/',
    explorationConsumeReturnTo: '/api/explorations/{id}/consume-return-to/',
    explorationRecordPromotion: '/api/explorations/{id}/record-promotion/',

    // ---- Derived resources ----------------------------------------------
    // Computed on request rather than stored, so they read as a collection but
    // answer with POST — the draft form carries SQL in the body. Model schemas
    // are inferred with SQLGlot from the source's cached schema (no database),
    // which is why a model that has never been run still has columns.
    modelSchemasList: '/api/model-schemas/',
    modelSchemaDetail: '/api/model-schemas/{name}/',

    // ---- Job resources --------------------------------------------------
    // Asynchronous work, all the same two-key shape: POST the list route to
    // start, GET the detail route to read the result or poll the status. The
    // detail segment is whatever the server accepts as an identifier — for
    // source schemas that is EITHER a source name or a run id, which is why
    // the param is `{identifier}` and not `{name}`.
    sourceSchemaJobsList: '/api/source-schema-jobs/',
    sourceSchemaJobDetail: '/api/source-schema-jobs/{identifier}/',

    modelQueryJobs: '/api/model-query-jobs/',
    modelQueryJobDetail: '/api/model-query-jobs/{jobId}/',

    // Read-only artifact manifests: built data, addressed in bulk. No POST —
    // the run produced these, the client only reads them.
    insightJobsQuery: '/api/insight-jobs/',
    inputJobsQuery: '/api/input-jobs/',
    modelJobsQuery: '/api/model-jobs/',

    // ---- Run control (cloud) --------------------------------------------
    // core/Django only; 404 under local `visivo serve`. Nested under a project
    // because cloud is multi-tenant and every one of these is scoped to it.
    projectCapabilities: '/api/projects/{projectId}/capabilities/',
    projectDraft: '/api/projects/{projectId}/draft/',
    projectBranch: '/api/projects/{projectId}/branch/',
    projectChanges: '/api/projects/{projectId}/changes/',
    projectCommit: '/api/projects/{projectId}/commit/',
    projectDiscard: '/api/projects/{projectId}/discard/',
    projectRun: '/api/projects/{projectId}/run/',
    runLogs: '/api/runs/{runId}/logs/',
    runCancel: '/api/runs/{runId}/cancel/',

    // ---- Local working copy ---------------------------------------------
    // The local server's git-ish surface: staged edits and how they land.
    commitStatus: '/api/commit/status/',
    commitPending: '/api/commit/pending/',
    commit: '/api/commit/',
    commitDiscard: '/api/commit/discard/',

    // ---- Stateless compute ----------------------------------------------
    // No stored resource behind any of these: request in, answer out. That is
    // why they are verbs on their own segment rather than nested under the
    // resource they happen to concern.
    queryExecution: '/api/query/{projectId}/',
    // Compares the explorer's unsaved working state against the project's
    // saved objects — the badges' source of truth. Project-scoped via
    // `withProjectId`, not a path param: the body already carries the state.
    explorerDiff: '/api/explorer/diff/',
    expressionsTranslate: '/api/expressions/translate/',
    // VIS-993 gate; server-only — dist/cloud fail open.
    expressionsValidate: '/api/expressions/validate/',
    // Deliberately its OWN top-level segment, NOT nested under /api/insights/ —
    // see insight_compile_views.py's docstring for why.
    insightCompileDraft: '/api/insight-compile-draft/',
    // Executes an aggregate draft against the FULL source; the compile
    // endpoint's `requires_full_source` decides when the client routes here.
    insightExecuteDraft: '/api/insight-execute-draft/',

    // ---- Whole-project reads --------------------------------------------
    project: '/api/project/',
    error: '/api/error/',
    projectFilePath: '/api/project/project_file_path/',
    dashboardQuery: '/api/dashboards/{name}/',
    dashboardThumbnail: '/api/dashboards/{name}.png/',

    // ---- Per-user / telemetry -------------------------------------------
    // Both servers implement preferences — cloud off the User row, local off
    // ~/.visivo/config.yml — with different defaults, which is how the viewer
    // stays free of local-vs-cloud branching.
    mePreferences: '/api/me/preferences/',
    // The local Flask server relays workspace events through the CLI's PostHog
    // client so the CLI telemetry opt-out + anonymization apply (VIS-822).
    workspaceTelemetry: '/api/telemetry/workspace-event/',
    // Persists a mark the viewer already emitted; sends no event. localStorage is per-origin,
    // so only a server-side ledger holds "once per journey" across browsers and serve ports.
    firstRunStep: '/api/telemetry/first-run/step/',

    // ---- Realtime ---------------------------------------------------------
    // Not a REST call — useProjectChangeListener gates its socket.io connect
    // on this key (VIS-1326). A dist build is static files with nothing to
    // hot-reload, so the connection can never succeed there.
    socketIo: '/socket.io/',
  },

  // A dist build is static files — there is no server, so almost nothing
  // resolves. Listing ~70 explicit `null`s buried the handful that DO, and made
  // every new server endpoint a line someone had to remember to add here.
  //
  // So name only what dist actually serves; everything else in `server` is
  // derived to null below. Unavailable-by-default is the right default, and it
  // cannot drift.
  dist: {
    project: '/data/project.json',
    error: '/data/error.json',
    insightJobsQuery: '/data/insights.json',
    inputJobsQuery: '/data/inputs.json',
    dashboardsList: '/data/dashboards.json',
    dashboardQuery: '/data/dashboards/{name}.json',
    dashboardThumbnail: '/data/dashboards/{name}.png',

    // Deliberately absent, though the artifacts exist:
    //   modelJobsQuery   — a dist build writes no model-jobs manifest.
    //   model-schemas    — inference needs a server; a dist build has none.
  },
};

// Every `server` key that dist does not serve resolves to null, so `isAvailable`
// reports false and `getUrl` throws the "not available in 'dist'" error rather
// than the "unknown key" one. Same behaviour the explicit nulls gave, minus the
// chance of forgetting a line.
URL_PATTERNS.dist = Object.fromEntries(
  Object.keys(URL_PATTERNS.server).map(key => [key, URL_PATTERNS.dist[key] ?? null])
);

/**
 * URL Configuration Manager
 */
class URLConfig {
  constructor(options = {}) {
    this.host = options.host || '';
    this.deploymentRoot = options.deploymentRoot || '';
    this.environment = options.environment || 'server';

    // Normalize deployment root: should be '' for base or '/subfolder' for subfolders
    if (this.deploymentRoot) {
      // Ensure it starts with / and doesn't end with /
      if (!this.deploymentRoot.startsWith('/')) {
        this.deploymentRoot = '/' + this.deploymentRoot;
      }
      if (this.deploymentRoot.endsWith('/')) {
        this.deploymentRoot = this.deploymentRoot.slice(0, -1);
      }
    }

    // Normalize host
    this.host = this.host.endsWith('/') ? this.host.slice(0, -1) : this.host;
  }

  /**
   * Get the route for React Router (always starts with /)
   * @returns {string} - Route path for React Router
   */
  getRoute() {
    return this.deploymentRoot || '/';
  }

  /**
   * Get URL for a specific endpoint key
   * @param {string} key - The endpoint key (e.g., 'project', 'traceData')
   * @param {object} params - Parameters to substitute in URL template (e.g., {name: 'trace1'})
   * @returns {string} - Complete URL
   */
  getUrl(key, params = {}) {
    const patterns = URL_PATTERNS[this.environment];

    if (!patterns) {
      throw new Error(`Unknown environment: ${this.environment}`);
    }

    const pattern = patterns[key];

    if (pattern === undefined) {
      throw new Error(`Unknown URL key: ${key}`);
    }

    if (pattern === null) {
      throw new Error(`URL key '${key}' is not available in '${this.environment}' environment`);
    }

    // Replace parameters in URL pattern
    let url = pattern;
    Object.entries(params).forEach(([param, value]) => {
      url = url.replace(new RegExp(`\\{${param}\\}`, 'g'), encodeURIComponent(value));
    });

    // Check for unreplaced parameters
    const unreplacedParams = url.match(/\{[^}]+\}/g);
    if (unreplacedParams) {
      throw new Error(`Missing parameters for URL '${key}': ${unreplacedParams.join(', ')}`);
    }

    // Build full URL
    const cleanUrl = url.startsWith('/') ? url : `/${url}`;
    return `${this.host}${this.deploymentRoot}${cleanUrl}`;
  }

  /**
   * Check if an endpoint is available in the current environment
   * @param {string} key - The endpoint key
   * @returns {boolean}
   */
  isAvailable(key) {
    const patterns = URL_PATTERNS[this.environment];
    return patterns && patterns[key] !== null && patterns[key] !== undefined;
  }
}

/**
 * Get deployment root from window object
 * @returns {string} - Deployment root from window or empty string
 */
function getWindowDeploymentRoot() {
  if (typeof window !== 'undefined' && 'deploymentRoot' in window) {
    return window.deploymentRoot || '';
  }
  return '';
}

/**
 * Create URLConfig instance with explicit settings
 * @param {object} options - Configuration options
 * @param {string} options.environment - Environment ('server' or 'dist') - required
 * @param {string} options.host - Base host URL (optional)
 * @param {string} options.deploymentRoot - Deployment root path (optional)
 * @returns {URLConfig}
 */
export function createURLConfig(options = {}) {
  if (!options.environment) {
    throw new Error('Environment is required when creating URLConfig');
  }

  const config = {
    environment: options.environment,
    host: options.host || '',
  };

  // Handle deploymentRoot: explicit option takes precedence, then window.deploymentRoot, then default to ''
  if ('deploymentRoot' in options) {
    config.deploymentRoot = options.deploymentRoot;
  } else {
    config.deploymentRoot = getWindowDeploymentRoot();
  }

  return new URLConfig(config);
}

// Export URLConfig class for advanced usage
export { URLConfig };
