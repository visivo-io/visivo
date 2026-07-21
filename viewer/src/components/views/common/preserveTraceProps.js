/**
 * preserveTraceProps — type-switch prop preservation for the Chart edit form (VIS-1020 §2).
 *
 * Mirrors the explorer `typePropsCache` semantics (`setInsightType` in
 * `src/stores/explorerStore.js`): when the user changes a chart's Plotly trace
 * `type`, we stash the full props under the OLD type key so an exact restoration is
 * possible if they switch back, then carry forward only the props that remain valid
 * for the NEW type's schema.
 *
 * This module is intentionally PURE: the per-type Plotly `.schema.json` (draft 2020-12,
 * shape `{ properties: {...} }`) is passed in as `newSchema` — there is no async load or
 * import here, so it is trivially unit-testable and free of side effects.
 *
 * @param {Object} args
 * @param {Object} args.oldProps        Current props for the trace (may include `type`).
 * @param {string} args.oldType         The trace type before the switch (e.g. 'scatter').
 * @param {string} args.newType         The trace type being switched to (e.g. 'bar').
 * @param {Object} args.newSchema       Per-type Plotly schema for `newType` ({ properties }).
 * @param {Object} [args.typePropsCache] Cache of `{ [type]: propsWithoutType }` from prior switches.
 * @returns {{ props: Object, typePropsCache: Object, dropped: string[] }}
 *   `props` always has `props.type === newType`.
 *   `typePropsCache` is a new object with `oldType`'s full props (minus `type`) stashed.
 *   `dropped` (T4 / pills-buildrail #2) — top-level prop names that had a
 *   value under `oldType` but aren't valid on `newType` (and aren't being
 *   silently restored from a prior visit to `newType`), so the caller can
 *   warn rather than lose them with no signal. Always `[]` when switching to
 *   a previously-visited type (an exact snapshot is restored instead) or
 *   when nothing was actually configured.
 */
export function preserveTraceProps({ oldProps, oldType, newType, newSchema, typePropsCache }) {
  const safeOldProps = oldProps && typeof oldProps === 'object' ? oldProps : {};
  const cache = typePropsCache && typeof typePropsCache === 'object' ? typePropsCache : {};

  // Strip `type` from the props we stash so the cache holds props-without-type,
  // matching the explorer-store convention where `type` lives outside `props`.
  const { type: _omitType, ...oldPropsWithoutType } = safeOldProps;

  // Stash the full old props under the old type key (for exact restoration on switch-back).
  const updatedCache = oldType
    ? { ...cache, [oldType]: { ...oldPropsWithoutType } }
    : { ...cache };

  // The set of top-level property names allowed by the new type's schema.
  const newProperties =
    newSchema && newSchema.properties && typeof newSchema.properties === 'object'
      ? newSchema.properties
      : {};
  const isAllowed = name => Object.prototype.hasOwnProperty.call(newProperties, name);

  // Base props: if the user previously visited `newType`, restore that exact snapshot.
  // Otherwise start empty and let carry-forward populate it.
  const restored =
    updatedCache[newType] && typeof updatedCache[newType] === 'object'
      ? { ...updatedCache[newType] }
      : {};

  // Carry forward any top-level prop from oldProps that ALSO exists in the new schema.
  // Compatibility check is kept simple: keep the path if its top-level property name is
  // present in `newSchema.properties`; drop it otherwise. Carry-forward values win over
  // the restored snapshot so the most recent user edits survive a round-trip.
  const carried = {};
  const dropped = [];
  // A prior visit to `newType` restores its exact snapshot (`restored`), so
  // anything not carried forward is already accounted for there — only warn
  // about a genuine loss when this is the FIRST visit to `newType`.
  const isFreshType = !updatedCache[newType];
  for (const [name, value] of Object.entries(oldPropsWithoutType)) {
    if (isAllowed(name)) {
      carried[name] = value;
    } else if (isFreshType) {
      dropped.push(name);
    }
  }

  const props = { ...restored, ...carried, type: newType };

  return { props, typePropsCache: updatedCache, dropped };
}

export default preserveTraceProps;
