import { useEffect, useMemo, useRef, useState } from 'react';
import useStore from '../stores/store';
import { useDuckDB } from '../contexts/DuckDBContext';
import { getConnection } from '../duckdb/duckdb';
import { runDuckDBQuery, prepPostQuery } from '../duckdb/queries';
import { processArrowResult } from '../duckdb/resultProcessing';
import { compileDraftInsight } from '../api/insightCompile';
import { executeDraftInsight } from '../api/insightExecuteDraft';
import { inferColumnTypes } from '../utils/inferColumnTypes';
import { expandDotNotationProps } from '../stores/explorerStore';
import { buildModelsSignature } from '../utils/insightFreshnessSignature';
import { collectInsightRefNames } from '../utils/refWalk';

/** Draft-namespaced insightJobs key (S2 draft-rendering-decision.md's
 * `__draft__:<insightName>` example) — never collides with a real published
 * insight of the same name (the seed-from-existing edit-in-place flow keeps
 * the original name), since Chart.jsx only ever reads whatever key
 * `chart.insights[].name` names, and the exploration's OWN live-preview
 * chart config is the only place that references this key. */
export const draftInsightKey = name => `__draft__:${name}`;

// The debounce coalesces rapid edits before hitting the server compile +
// DuckDB. Free-text expression typing needs the full window (a user types
// several characters within a second). But a STRUCTURAL edit — a field added or
// removed by a drop, a chart-type switch, an interaction added/removed — is a
// single deliberate commit, not a keystroke burst, so it should compile almost
// immediately instead of making the user wait a full second to see the chart
// respond (Explore 2.0 state fix, Phase 2 — "debounce typing, not drops"). The
// structural-vs-value distinction is derived from the config itself (the set of
// prop KEYS / type / interaction count changed vs only prop VALUES changed), so
// no edit-source plumbing is needed.
const COMPILE_DEBOUNCE_MS = 1000;
const STRUCTURAL_DEBOUNCE_MS = 150;

// Matches DuckDB's raw "Catalog Error: Table with name <hash> does not
// exist!" — the internal draft-lane materialization table name this hook
// itself mints (`draft_model_<name_hash>_<ts>` registered as `"<name_hash>"`
// below). See the pre-execution guard's docstring for the primary fix; this
// pattern is the belt-and-braces fallback ux-audit.md's fix direction calls
// for so a leaked hash can never reach the user even from an unanticipated
// path.
const HASHED_TABLE_ERROR_PATTERN = /Table with name [0-9a-zA-Z_]{8,} does not exist/i;

/** Extract `${name.accessor}` input dependencies from post_query + static_props
 * — byte-for-byte the same regex `useInsightsData.js`'s `processInsight` uses
 * for real insights, so a draft's `pendingInputs`/`inputDependencies` behave
 * identically once promoted (duplicated rather than exported to keep that
 * hot, heavily-covered file's surface unchanged). */
const extractInputNamesFromString = text => {
  if (!text) return new Set();
  const names = new Set();
  for (const match of text.matchAll(/\$\{(\w+)\.\w+\}/g)) names.add(match[1]);
  return names;
};
const extractInputNamesFromObject = obj => {
  const names = new Set();
  const scan = value => {
    if (typeof value === 'string') {
      extractInputNamesFromString(value).forEach(n => names.add(n));
    } else if (Array.isArray(value)) {
      value.forEach(scan);
    } else if (typeof value === 'object' && value !== null) {
      Object.values(value).forEach(scan);
    }
  };
  scan(obj);
  return names;
};
const extractInputDependencies = (query, staticProps) => {
  const names = extractInputNamesFromString(query);
  extractInputNamesFromObject(staticProps).forEach(n => names.add(n));
  return [...names];
};

const EMPTY_INSIGHT_STATUS = { isLoading: false, error: null, blockedReason: null, blockedModel: null };

/**
 * The result the USER is looking at, and therefore the one the preview must be
 * built from.
 *
 * A model has two results in the store. `queryResult` is what the source
 * returned. `enrichedResult` is that plus any computed columns the user added
 * (useExplorerDuckDB computes them client-side in DuckDB and writes them here);
 * it is what the results grid renders and what a user drags a column FROM.
 *
 * Reading `queryResult` here meant a computed column could be dropped into a
 * chart well and then fail to render: the schema sent to the compile endpoint
 * listed only the source's own columns, so FieldResolver rejected the
 * expression with `Column 'less_than_4' not found on model 'model'. Available
 * columns: X, Y` — naming, as unavailable, a column visibly present in the grid
 * directly below the error. The DuckDB table registered for `post_query` was
 * built from the same raw rows, so it would have been missing the column too
 * even if the compile had passed.
 *
 * `enrichedResult` is shaped exactly like `queryResult` (`{columns, rows,
 * row_count}`) and is only ever set when there are computed columns, so
 * preferring it is a superset in every case.
 */
const visibleResult = modelState => modelState?.enrichedResult || modelState?.queryResult;

/**
 * useDraftInsightPreview — Explore 2.0 Phase 4 (S2's resolved design). Live,
 * client-side preview for the exploration surface's UNSAVED chart/insight
 * drafts: debounced compile-draft calls -> synthetic draft-namespaced
 * `insightJobs` entries Chart.jsx already knows how to render (S2 Q1) ->
 * the client DuckDB-WASM lane (Q2), never a server-side run.
 *
 * Reads the legacy `explorerStore.js` working state directly (the live
 * editing surface for the active exploration — see `ExplorationPane.jsx`'s
 * docstring) rather than taking props, so any Build-rail edit is picked up
 * automatically.
 *
 * PER-INSIGHT STATE (VIS-1092, Phase 5 preview-lane fix): loading/error/
 * blocked state is tracked PER CHART INSIGHT (`perInsight`, keyed by insight
 * NAME), not as one flag shared across the whole debounce pass. A mixed-lane
 * chart (one insight already promoted with real data, one still a draft)
 * used to let the STILL-DRAFT insight's error/loading state blank the
 * ENTIRE chart — including the already-rendering promoted insight — because
 * the whole loop shared one `isLoading`/`error` pair that
 * `ExplorerChartPreview.jsx` forwarded straight to `<ChartPreview>`'s
 * whole-chart-gating props. The aggregate `isLoading`/`error`/`blockedReason`
 * /`blockedModel` fields below are still returned for simple (single- or
 * uniform-insight) callers, but a caller that needs mixed-lane correctness
 * should read `perInsight[name]` instead — see `ExplorerChartPreview.jsx`.
 *
 * REQUEST-ORDERING GUARD (VIS-1094): each debounce fire is stamped with a
 * monotonic generation number (`compileGenerationRef`). A rapid second edit
 * arms a NEW debounce cycle whose fired pass increments the generation
 * BEFORE the first pass's still-in-flight network/DuckDB chain can resolve;
 * every write this hook makes (`updateInsightJob`/`removeInsightJob`/
 * `setPerInsight`) is guarded by "is my generation still the current one" —
 * a slower, stale pass's response is silently dropped rather than
 * clobbering the faster, newer pass's already-applied result.
 *
 * @returns {{
 *   previewInsightKeys: string[],
 *   perInsight: Record<string, {isLoading: boolean, error: string|null, blockedReason: string|null, blockedModel: string|null}>,
 *   isLoading: boolean,
 *   error: string|null,
 *   blockedReason: 'model_not_run'|null,
 *   blockedModel: string|null,
 * }}
 */
const useDraftInsightPreview = () => {
  const db = useDuckDB();
  const chartInsightNames = useStore(s => s.explorerChartInsightNames);
  const insightStates = useStore(s => s.explorerInsightStates);
  const modelStates = useStore(s => s.explorerModelStates);
  const inputJobs = useStore(s => s.inputJobs);
  const updateInsightJob = useStore(s => s.updateInsightJob);
  const removeInsightJob = useStore(s => s.removeInsightJob);

  // { [insightName]: { isLoading, error, blockedReason, blockedModel } }
  const [perInsight, setPerInsight] = useState({});

  const setInsightStatus = (name, patch) =>
    setPerInsight(prev => ({
      ...prev,
      [name]: { ...EMPTY_INSIGHT_STATUS, ...prev[name], ...patch },
    }));

  const debounceRef = useRef(null);
  const registeredTablesRef = useRef(new Map()); // model_hash -> row-count fingerprint
  const seenDraftKeysRef = useRef(new Set());
  // VIS-1094 — bumped once per debounce FIRE (not per render); every write
  // below checks its own captured generation against the current one before
  // touching the store, so a stale (slower, out-of-order) pass never wins.
  const compileGenerationRef = useRef(0);
  // Last-seen config STRUCTURE (prop key-sets / type / interaction counts +
  // the insight list) — lets the effect tell a structural edit (drop, remove,
  // type switch) apart from value-only typing to pick the debounce window.
  const prevStructureRef = useRef(null);

  const previewInsightKeys = useMemo(
    () => chartInsightNames.map(draftInsightKey),
    [chartInsightNames]
  );

  // Recompile signature: any change to the chart's insight list, insight
  // props/interactions/type, or a referenced model's SQL/source/rows should
  // trigger a recompute. JSON-stringified once here so the effect below has a
  // single stable dependency instead of five churny object references.
  // `modelsSig` is the shared `insightFreshnessSignature.js` helper — the
  // promoted-lane freshness check (`ExplorerChartPreview.jsx`) must consider
  // a model edit "changed" under the exact same rule this recompute trigger
  // does (P6-D2), so the two are never allowed to drift apart.
  const signature = useMemo(() => {
    const insightsSig = chartInsightNames.map(name => {
      const s = insightStates[name];
      return { name, type: s?.type, props: s?.props, interactions: s?.interactions };
    });
    // Fold ONLY the models the charted insights actually reference (union of
    // each insight's `collectInsightRefNames`) — the EXACT set the promoted-
    // lane freshness check scopes to per-insight (P6-D2), so an unrelated
    // model's edit/rename never triggers a spurious recompile here nor a
    // spurious staleness there.
    const referencedNames = new Set();
    chartInsightNames.forEach(name => {
      collectInsightRefNames(insightStates[name]).forEach(n => referencedNames.add(n));
    });
    const modelsSig = buildModelsSignature(modelStates, referencedNames);
    return JSON.stringify({ insightsSig, modelsSig });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartInsightNames, insightStates, modelStates]);

  useEffect(() => {
    // Cleanup draft entries for insights no longer on the chart.
    const currentKeys = new Set(previewInsightKeys);
    seenDraftKeysRef.current.forEach(key => {
      if (!currentKeys.has(key)) {
        removeInsightJob(key);
        seenDraftKeysRef.current.delete(key);
      }
    });
    setPerInsight(prev => {
      const currentNames = new Set(chartInsightNames);
      const next = {};
      let changed = false;
      Object.keys(prev).forEach(name => {
        if (currentNames.has(name)) next[name] = prev[name];
        else changed = true;
      });
      return changed ? next : prev;
    });

    if (!db || chartInsightNames.length === 0) return undefined;

    // Immediate feedback (Explore 2.0 state fix, Phase 1): the COMPILE is
    // debounced, but the STATUS must not lag it. An insight that just gained its
    // first data prop otherwise sits on its stale pre-drop state
    // ('no_data_props' → "Nothing to preview yet") for the whole debounce window
    // before the callback below flips it to isLoading — reading as "the drop did
    // nothing" for ~1s. Flip any insight that now has data props but no rendered
    // frame to loading synchronously, so the preview shows a building state the
    // instant the column lands. Insights that already have a frame keep it
    // (non-destructive); ones with nothing mapped stay untouched (the debounced
    // pass sets their guided 'no_data_props' empty state). perInsight status is
    // not in this effect's dependency array, so this cannot re-trigger the pass.
    for (const name of chartInsightNames) {
      const state = insightStates[name];
      if (!state) continue;
      const hasDataProps = Object.keys(state.props || {}).some(
        k => state.props[k] !== undefined && state.props[k] !== ''
      );
      const hasRenderedData = useStore.getState().insightJobs?.[draftInsightKey(name)]?.data != null;
      if (hasDataProps && !hasRenderedData) {
        setInsightStatus(name, { isLoading: true, error: null, blockedReason: null, blockedModel: null });
      }
    }

    // Structural edit (drop / remove / type switch / interaction add-remove /
    // insight-list change) → compile fast; value-only typing → coalesce.
    // Compared against the LAST structure this effect saw, not the last data
    // change, so a source re-run (which leaves the structure untouched) keeps
    // the coalescing window. The very first run has no prior structure, so it
    // is treated as structural (build the first preview promptly).
    const structureNow = JSON.stringify(
      chartInsightNames.map(name => ({
        name,
        type: insightStates[name]?.type,
        keys: Object.keys(insightStates[name]?.props || {}).sort(),
        interactions: (insightStates[name]?.interactions || []).length,
      }))
    );
    const isStructuralEdit = structureNow !== prevStructureRef.current;
    prevStructureRef.current = structureNow;
    const debounceMs = isStructuralEdit ? STRUCTURAL_DEBOUNCE_MS : COMPILE_DEBOUNCE_MS;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      // VIS-1094 — this pass's identity. Any write below whose captured
      // generation no longer matches `compileGenerationRef.current` (a
      // NEWER debounce fire has since started) is stale and skipped.
      const myGeneration = ++compileGenerationRef.current;
      const isStale = () => compileGenerationRef.current !== myGeneration;

      // Non-destructive block (Explore 2.0 state fix, Phase 1): a transient
      // "model has no rows right now" outcome must NOT blank an insight that
      // already has a rendered frame on screen. The render layer
      // (ExplorerChartPreview's `anyInsightAlreadyHasData`) already SUPPRESSES
      // the blocked/error states while `insightJobs[draftKey].data` exists — the
      // only thing that dropped a good chart to the "Run your query" state was
      // this hook DELETING that data via `removeInsightJob`. So: keep the last
      // good frame when there is one, and only clear + surface the blocked state
      // when there is genuinely nothing to preserve (a first render that never
      // succeeded). Returns true when it actually cleared.
      const clearDraftUnlessRendered = draftKey => {
        if (useStore.getState().insightJobs?.[draftKey]?.data != null) return false;
        removeInsightJob(draftKey);
        seenDraftKeysRef.current.delete(draftKey);
        return true;
      };

      // Every DuckDB draft-table name_hash any charted insight actually
      // depends on THIS pass (populated in the register loop below). After the
      // pass, any hash still in `registeredTablesRef` but absent here is an
      // orphan — a renamed model minted a new hash, or a model was removed /
      // switched to the server-execute lane — and gets dropped + evicted.
      const neededHashes = new Set();

      for (const name of chartInsightNames) {
        const state = insightStates[name];
        const draftKey = draftInsightKey(name);
        if (!state) {
          setInsightStatus(name, EMPTY_INSIGHT_STATUS);
          continue;
        }
        const hasDataProps = Object.keys(state.props || {}).some(k => state.props[k] !== undefined && state.props[k] !== '');
        if (!hasDataProps) {
          // ux-audit.md "infinite spinner" finding (cold-start #2): an
          // insight with nothing mapped yet has NOTHING to compile — no
          // network call is ever made for it. Previously this reset to
          // EMPTY_INSIGHT_STATUS (not loading, not blocked, not errored),
          // which `ExplorerChartPreview` had no way to distinguish from "not
          // yet checked" — it fell through to `<ChartPreview>` -> `<Chart>`,
          // whose OWN `hasAllInsightData` gate then spun forever waiting for
          // `insightJobs[draftKey].data` that nothing was ever going to
          // populate (this hook correctly never even tries). Every terminal
          // outcome now gets an explicit blockedReason so the caller can
          // render a guided empty state instead of a dead spinner.
          setInsightStatus(name, {
            isLoading: false,
            error: null,
            blockedReason: 'no_data_props',
            blockedModel: null,
          });
          continue;
        }

        setInsightStatus(name, { isLoading: true, error: null, blockedReason: null, blockedModel: null });

        const expandedProps = expandDotNotationProps(state.props);
        const backendInteractions = (state.interactions || [])
          .filter(i => i.value)
          .map(i => ({ [i.type]: i.value }));

        const draftModels = Object.entries(modelStates)
          .filter(([, s]) => s?.sql && s?.sourceName)
          .map(([modelName, s]) => ({
            name: modelName,
            sql: s.sql,
            source: `\${ref(${s.sourceName})}`,
          }));

        const modelSchemas = {};
        Object.entries(modelStates).forEach(([modelName, s]) => {
          const result = visibleResult(s);
          if (!result?.rows?.length || !Array.isArray(result.columns)) return;
          const inferred = inferColumnTypes(result.columns, result.rows);
          modelSchemas[modelName] = Object.fromEntries(
            inferred.map(c => [c.name, c.normalizedType])
          );
        });

        try {
          const compiled = await compileDraftInsight({
            insight: {
              name,
              props: { type: state.type, ...expandedProps },
              ...(backendInteractions.length > 0 ? { interactions: backendInteractions } : {}),
            },
            draftModels,
            modelSchemas,
          });
          if (isStale()) continue;

          // ux-audit.md "draft-preview execution gap" (BLOCKER — cold-start
          // #1, promote-roundtrip #1): a draft's props can compile to a
          // valid `post_query` (200) even when FieldResolver never needed a
          // schema lookup for the specific expression — see
          // insight_compile_views.py's docstring. That `post_query` still
          // qualifies columns against `compiled.models[].name_hash`
          // table(s), which only get CREATEd below when this hook already
          // has fetched rows for them. Executing anyway used to hand DuckDB
          // a query against a table that was NEVER created, surfacing a raw
          // "Catalog Error: Table with name <hash> does not exist!" — an
          // internal identifier leaked straight to the user (see
          // ChartPreview.jsx's error panel). Every dependent model must have
          // actually-fetched rows (the SQL/results lane's own queryResult)
          // BEFORE post_query is ever sent to DuckDB; otherwise this is
          // exactly the same "run the query first" gap the server's 422
          // already models — reuse that same guided state instead of
          // executing a doomed query.
          const unloadedModel = (compiled.models || []).find(model => {
            const rows = visibleResult(modelStates[model.name])?.rows;
            return !rows || !rows.length;
          });
          if (unloadedModel) {
            if (!isStale()) {
              const cleared = clearDraftUnlessRendered(draftKey);
              setInsightStatus(name, {
                isLoading: false,
                error: null,
                blockedReason: cleared ? 'model_not_run' : null,
                blockedModel: cleared ? unloadedModel.name : null,
              });
            }
            continue;
          }

          const requiredInputs = extractInputDependencies(
            compiled.post_query,
            compiled.static_props
          );

          // Explore 2.0 state fix, Phase 3 — server EXECUTE lane. The compile
          // endpoint classifies whether this insight's query is a pure row-level
          // projection (safe to run client-side over the fetched sample) or an
          // AGGREGATE/window/split/relation-join whose result would be WRONG over
          // a sample (a SUM over 1,000 sampled rows is not the real total). For
          // the aggregate case, execute the query against the FULL source and
          // bind the returned rows directly — no DuckDB registration, no
          // post_query. A dynamic insight (unresolved input deps) can't be baked
          // server-side; the endpoint 409s and we fall through to the client
          // sample lane below (best effort — flagged as a known-approximate case).
          if (compiled.requires_full_source && requiredInputs.length === 0) {
            try {
              const executed = await executeDraftInsight({
                insight: {
                  name,
                  props: { type: state.type, ...expandedProps },
                  ...(backendInteractions.length > 0
                    ? { interactions: backendInteractions }
                    : {}),
                },
                draftModels,
                modelSchemas,
              });
              if (isStale()) continue;
              updateInsightJob(draftKey, {
                name: draftKey,
                data: executed.rows,
                props_mapping: executed.props_mapping,
                static_props: executed.static_props,
                props_slices: executed.props_slices,
                split_key: executed.split_key,
                type: executed.type,
                pendingInputs: null,
                inputDependencies: requiredInputs,
              });
              seenDraftKeysRef.current.add(draftKey);
              setInsightStatus(name, EMPTY_INSIGHT_STATUS);
              // Server lane complete — skip the client DuckDB register + run.
              continue;
            } catch (execErr) {
              if (isStale()) continue;
              // 409 requires_client_lane → fall through to the client sample
              // lane below. Any other failure (422 model_not_run, a real error)
              // is raised to the shared catch, which applies the non-destructive
              // guard (never blanks an already-rendered frame).
              if (execErr?.errorType !== 'requires_client_lane') throw execErr;
            }
          }

          // Register each dependent model's ALREADY-FETCHED rows (the
          // SQL/results lane, `modelStates[name].queryResult`) as a DuckDB
          // table named by the model's hash — the exact table name
          // `compiled.post_query` qualifies columns against (S2 Q2's forced
          // dynamic/duckdb build path). Every model reaching this point is
          // already known (via the guard above) to have fetched rows.
          const conn = await getConnection(db);
          for (const model of compiled.models || []) {
            // A live dependency of this pass — its table must survive the
            // post-pass orphan sweep even if it has no rows to (re)register.
            neededHashes.add(model.name_hash);
            const result = visibleResult(modelStates[model.name]);
            const rows = result?.rows || [];
            if (!rows.length) continue;
            // The column list is part of the identity: adding or removing a
            // computed column changes the shape without changing the row count
            // or the SQL, and a fingerprint blind to that would keep serving a
            // stale table that lacks the column the user just added.
            const fingerprint = `${rows.length}:${modelStates[model.name]?.sql}:${(
              result.columns || []
            ).join(',')}`;
            if (registeredTablesRef.current.get(model.name_hash) === fingerprint) continue;
            const tempFile = `draft_model_${model.name_hash}_${Date.now()}.json`;
            // eslint-disable-next-line no-await-in-loop
            await db.registerFileText(tempFile, JSON.stringify(rows));
            // eslint-disable-next-line no-await-in-loop
            await conn.query(
              `CREATE OR REPLACE TABLE "${model.name_hash}" AS SELECT * FROM read_json_auto('${tempFile}')`
            );
            // eslint-disable-next-line no-await-in-loop
            await db.dropFile(tempFile);
            registeredTablesRef.current.set(model.name_hash, fingerprint);
          }
          if (isStale()) continue;

          const missingInputs = requiredInputs.filter(inputName => !inputJobs[inputName]);

          if (missingInputs.length > 0) {
            if (!isStale()) {
              updateInsightJob(draftKey, {
                name: draftKey,
                data: null,
                props_mapping: compiled.props_mapping,
                static_props: compiled.static_props,
                props_slices: compiled.props_slices,
                split_key: compiled.split_key,
                type: compiled.type,
                pendingInputs: missingInputs,
                inputDependencies: requiredInputs,
              });
              seenDraftKeysRef.current.add(draftKey);
              setInsightStatus(name, EMPTY_INSIGHT_STATUS);
            }
          } else {
            const preparedQuery = prepPostQuery({ query: compiled.post_query }, inputJobs);
            // eslint-disable-next-line no-await-in-loop
            const arrowResult = await runDuckDBQuery(db, preparedQuery, 2, 300);
            if (isStale()) continue;
            const rows = processArrowResult(arrowResult);
            updateInsightJob(draftKey, {
              name: draftKey,
              data: rows,
              props_mapping: compiled.props_mapping,
              static_props: compiled.static_props,
              props_slices: compiled.props_slices,
              split_key: compiled.split_key,
              type: compiled.type,
              pendingInputs: null,
              inputDependencies: requiredInputs,
            });
            seenDraftKeysRef.current.add(draftKey);
            setInsightStatus(name, EMPTY_INSIGHT_STATUS);
          }
        } catch (err) {
          if (isStale()) continue;
          if (err?.errorType === 'model_not_run') {
            const cleared = clearDraftUnlessRendered(draftKey);
            setInsightStatus(name, {
              isLoading: false,
              error: null,
              blockedReason: cleared ? 'model_not_run' : null,
              blockedModel: cleared ? err.modelName || null : null,
            });
          } else if (HASHED_TABLE_ERROR_PATTERN.test(err?.message || '')) {
            // Belt-and-braces (ux-audit.md's own fix direction): the guard
            // above should make this unreachable in practice, but if ANY
            // other path ever reaches DuckDB against an unregistered draft
            // table, treat it the same as "run the query first" rather than
            // leaking the raw hashed table name in `error`.
            const cleared = clearDraftUnlessRendered(draftKey);
            setInsightStatus(name, {
              isLoading: false,
              error: null,
              blockedReason: cleared ? 'model_not_run' : null,
              blockedModel: null,
            });
          } else {
            const cleared = clearDraftUnlessRendered(draftKey);
            setInsightStatus(name, {
              isLoading: false,
              error: cleared ? err?.message || String(err) : null,
              blockedReason: null,
              blockedModel: null,
            });
          }
        }
      }

      // Orphan-table GC (Phase 4b Step 2). A model's DuckDB draft table is
      // named by its `name_hash` (a hash of the model NAME), so renaming a
      // model mints a NEW hash and leaves the OLD-hash table registered
      // forever — an unbounded leak in both DuckDB-WASM and
      // `registeredTablesRef`, and the stale hash is exactly the kind of dead
      // table `post_query` could later qualify against (HASHED_TABLE_ERROR).
      // Drop every registered hash no charted insight still depends on, and
      // evict it. Skipped when the pass is stale (a newer fire owns the tables
      // now) so we never drop a table the winning pass just registered.
      if (!isStale()) {
        const staleHashes = [...registeredTablesRef.current.keys()].filter(
          hash => !neededHashes.has(hash)
        );
        if (staleHashes.length) {
          const conn = await getConnection(db);
          for (const hash of staleHashes) {
            try {
              // eslint-disable-next-line no-await-in-loop
              await conn.query(`DROP TABLE IF EXISTS "${hash}"`);
            } catch {
              // A table that never materialised (a no-rows model) is already
              // gone — dropping it is a no-op; never let GC failure surface.
            }
            registeredTablesRef.current.delete(hash);
          }
        }
      }
    }, debounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, signature]);

  // Full cleanup on unmount (exploration tab closed) — no leaked synthetic
  // entries across sessions. Deliberately reads `seenDraftKeysRef.current` AT
  // CLEANUP TIME (not a snapshot from mount) — this ref is a bookkeeping set
  // that accumulates across the component's whole lifetime (every debounced
  // compile cycle adds to it), so the exhaustive-deps rule's usual "copy
  // .current into a variable inside the effect" fix would capture it EMPTY
  // (before anything was ever added) and clean up nothing. Not a DOM-node
  // ref, so that class of staleness bug doesn't apply here.
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      seenDraftKeysRef.current.forEach(key => removeInsightJob(key));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aggregate fields — backward-compatible for a single-insight (or uniform-
  // status) caller. A caller on a MIXED-lane chart (VIS-1092) should read
  // `perInsight[name]` per key instead of these, which collapse every
  // insight's status into one shared flag again by construction.
  const statuses = chartInsightNames.map(name => perInsight[name] || EMPTY_INSIGHT_STATUS);
  const isLoading = statuses.some(s => s.isLoading);
  const errorStatus = statuses.find(s => s.error);
  const blockedStatus = statuses.find(s => s.blockedReason);

  return {
    previewInsightKeys,
    perInsight,
    isLoading,
    error: errorStatus?.error || null,
    blockedReason: blockedStatus?.blockedReason || null,
    blockedModel: blockedStatus?.blockedModel || null,
  };
};

export default useDraftInsightPreview;
