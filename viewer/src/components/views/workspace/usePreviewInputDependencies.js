import { useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import useStore from '../../../stores/store';
import { useInputsData } from '../../../hooks/useInputsData';
import { extractInputDependenciesFromProps } from '../../../models/Insight';

/**
 * usePreviewInputDependencies — VIS-1003 / design §5 + §8.3.
 *
 * The single source of truth for "which input widgets does this preview need?"
 * across chart, table, and insight previews. It produces the UNION of every
 * input an object's parent insights depend on and resolves each to its `<Input>`
 * config so a presentational strip can render the controls.
 *
 * Dependency discovery (union of two sources):
 *   1. RUNTIME (graph-resolved): for each insight name, `insightJobs[n]
 *      .inputDependencies` plus `insightJobs[n].pendingInputs`. This is the
 *      authoritative set once an insight's metadata has loaded.
 *   2. CONFIG FALLBACK (timing window): `extractInputDependenciesFromProps`
 *      across props + layout + interactions of `configForFallback`, covering
 *      the window before `inputDependencies` populates (and the never-run case).
 *
 * Each discovered name is resolved against the store `inputs` collection to an
 * `<Input>` config; unresolvable names are dropped. `useInputsData` is then
 * called with the resolved names so options load and a DEFAULT value is seeded
 * (always-default — the body renders immediately; the widget lets the user
 * change it).
 *
 * VIS-831 INVARIANT: this hook NEVER keys insight refetch on a pending/resolved
 * boolean. It reads `pendingInputs` only to widen the *name set* passed to
 * `useInputsData`; the sole refetch trigger remains a VALUE write via
 * `setInputJobValue` (driven by the rendered `<Input>` widgets), which
 * `useInsightsData` keys on through `stableRelevantInputs`.
 *
 * @param {string} projectId
 * @param {Object} params
 * @param {string[]} params.insightNames - Parent insight names (multi-insight → union)
 * @param {Object} [params.configForFallback] - Object config (props/layout/interactions) for the config-only window
 * @param {string[]} [params.extraModelNames] - Additional known model names to
 *   exclude from `unresolvedNames` beyond the published `state.models` list —
 *   e.g. an exploration's own draft/not-yet-promoted model tabs, which the
 *   caller knows about but this hook (deliberately store-generic) doesn't.
 * @returns {{ inputConfigs: Object[], unresolvedNames: string[] }} resolved
 *   `<Input>` configs (empty when none), plus `unresolvedNames` — referenced
 *   names that matched NEITHER a real Input config NOR a known model NOR
 *   (Explore 2.0 Phase 4) a draft input still local to the exploration. A
 *   draft referencing a genuinely undefined input must surface this
 *   explicitly, never silently drop it
 *   (specs/plan/explorer-workspace-unification/02-architecture.md §6).
 *
 *   ux-audit.md's "unresolved-input misclassification" finding (cold-start
 *   #3, promote-roundtrip #3, pills #3): `extractInputDependenciesFromProps`
 *   (models/Insight.js) matches ANY `${ref(name).col}` / `${name.col}`
 *   context string it finds — including a MODEL column ref the Build rail's
 *   own pill drops write (`?{${ref(model).column}}`), not just genuine Input
 *   references. Model names (published + the caller-supplied draft set) are
 *   therefore excluded here before a name is called "unresolved" — a model
 *   ref was never an input dependency in the first place.
 */
export const usePreviewInputDependencies = (
  projectId,
  { insightNames = [], configForFallback, extraModelNames = [] }
) => {
  const storeInputs = useStore(s => s.inputs);
  const fetchInputs = useStore(s => s.fetchInputs);
  // A stable, sorted array (mirrors `runtimeNames`' own convention below) —
  // `useShallow` compares this element-by-element rather than by Set
  // identity, so an unrelated store write doesn't churn it every render.
  const storeModelNames = useStore(useShallow(s => (s.models || []).map(m => m.name).sort()));

  // Lazy-load the inputs list ONCE if we don't have it. A project with no
  // inputs makes `fetchInputs` write a fresh empty array on every call, which
  // changes the `inputs` reference; keying this effect on `storeInputs` then
  // re-ran it endlessly (a continuous /api/inputs/ poll). Guard with a ref so
  // the fetch fires at most once regardless of that reference churn.
  const fetchedInputsRef = useRef(false);
  useEffect(() => {
    if (fetchedInputsRef.current) return;
    if ((!storeInputs || storeInputs.length === 0) && typeof fetchInputs === 'function') {
      fetchedInputsRef.current = true;
      fetchInputs();
    }
  }, [storeInputs, fetchInputs]);

  const stableInsightNames = useMemo(
    () => [...new Set((insightNames || []).filter(Boolean))].sort(),
    [insightNames]
  );

  // Runtime dependency union: inputDependencies + pendingInputs per insight job.
  // Read via a shallow selector that returns a stable sorted array so the memo
  // below doesn't churn on unrelated insightJobs writes.
  const runtimeNames = useStore(
    useShallow(s => {
      const names = new Set();
      for (const n of stableInsightNames) {
        const job = s.insightJobs?.[n];
        if (!job) continue;
        (job.inputDependencies || []).forEach(dep => names.add(dep));
        (job.pendingInputs || []).forEach(dep => names.add(dep));
      }
      return Array.from(names).sort();
    })
  );

  // Config-fallback union across props + layout + interactions (timing window
  // before inputDependencies populates, and the never-run case).
  const fallbackNames = useMemo(() => {
    if (!configForFallback) return [];
    return extractInputDependenciesFromProps(configForFallback);
  }, [configForFallback]);

  const allReferencedNames = useMemo(
    () => [...new Set([...runtimeNames, ...fallbackNames])].sort(),
    [runtimeNames, fallbackNames]
  );

  // Resolve name → <Input> config from the store inputs collection. Names with
  // no matching input config (e.g. a model ref mistaken as an input) are dropped
  // from `inputConfigs` but surfaced via `unresolvedNames` (Explore 2.0 Phase 4)
  // so a draft referencing a genuinely undefined input isn't a silent drop.
  const configByName = useMemo(
    () => new Map((storeInputs || []).map(ic => [ic.name, ic.config || ic])),
    [storeInputs]
  );
  // Model names — published (`state.models`) union the caller's own known
  // draft set — are never input dependencies, no matter how they were
  // harvested (see the docstring's "unresolved-input misclassification"
  // note above).
  const knownModelNames = useMemo(
    () => new Set([...storeModelNames, ...(extraModelNames || [])]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storeModelNames, JSON.stringify(extraModelNames || [])]
  );
  const inputConfigs = useMemo(() => {
    if (allReferencedNames.length === 0) return [];
    return allReferencedNames.filter(name => configByName.has(name)).map(name => configByName.get(name));
  }, [allReferencedNames, configByName]);
  const unresolvedNames = useMemo(
    () =>
      allReferencedNames.filter(name => !configByName.has(name) && !knownModelNames.has(name)),
    [allReferencedNames, configByName, knownModelNames]
  );

  // Load options + seed defaults for the resolved inputs. Keyed only on the
  // resolved NAMES — never on pending/resolved state (VIS-831).
  const inputNamesToLoad = useMemo(() => inputConfigs.map(c => c.name), [inputConfigs]);
  useInputsData(projectId, inputNamesToLoad);

  return { inputConfigs, unresolvedNames };
};

export default usePreviewInputDependencies;
