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
 * @returns {{ inputConfigs: Object[] }} resolved `<Input>` configs (empty when none)
 */
export const usePreviewInputDependencies = (projectId, { insightNames = [], configForFallback }) => {
  const storeInputs = useStore(s => s.inputs);
  const fetchInputs = useStore(s => s.fetchInputs);

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
  // no matching input config (e.g. a model ref mistaken as an input) are dropped.
  const inputConfigs = useMemo(() => {
    if (!storeInputs || storeInputs.length === 0 || allReferencedNames.length === 0) return [];
    const configByName = new Map(storeInputs.map(ic => [ic.name, ic.config || ic]));
    return allReferencedNames
      .filter(name => configByName.has(name))
      .map(name => configByName.get(name));
  }, [allReferencedNames, storeInputs]);

  // Load options + seed defaults for the resolved inputs. Keyed only on the
  // resolved NAMES — never on pending/resolved state (VIS-831).
  const inputNamesToLoad = useMemo(() => inputConfigs.map(c => c.name), [inputConfigs]);
  useInputsData(projectId, inputNamesToLoad);

  return { inputConfigs };
};

export default usePreviewInputDependencies;
