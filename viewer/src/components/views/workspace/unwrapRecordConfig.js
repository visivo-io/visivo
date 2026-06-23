/**
 * unwrapRecordConfig — the single home for the "envelope vs bare" config shape
 * that every store collection entry can take (VIS-1018 step 1).
 *
 * Store collections (`dashboards`, `charts`, `markdowns`, …) hold one entry per
 * record, and that entry comes in TWO shapes depending on the source slice:
 *
 *   - ENVELOPE:  `{ name, status, config: { …the real config… } }`
 *   - BARE:      `{ name, …the config fields inline… }`
 *
 * Optimistic-update + canvas code re-implemented the
 * `entry.config ? { ...entry.config } : entry` discriminator in ~6 places
 * (updateDashboardConfigOptimistic, addDashboardRow, useCanvasRecord, …). When
 * one site disagreed with another about the shape, an edit could be written
 * back into the wrong slot. These two helpers make the discriminator a single
 * point of truth.
 */

/**
 * Read the config out of a collection entry, regardless of envelope-vs-bare.
 * Returns the entry itself when it is already bare. Returns `null`/the entry
 * unchanged for nullish input (callers handle the no-op).
 *
 * @param {object|null|undefined} entry  a collection entry (`{ name, config }`
 *        envelope, or a bare config object).
 * @returns {object|null} the unwrapped config.
 */
export function unwrapConfig(entry) {
  if (entry == null) return entry;
  return entry.config ? entry.config : entry;
}

/**
 * Produce the NEXT collection entry that carries `nextConfig`, preserving the
 * entry's existing shape. An envelope entry keeps its `{ name, status, … }`
 * sidecar and gets `config` replaced; a bare entry is replaced wholesale by
 * `nextConfig`.
 *
 * This is the inverse of `unwrapConfig` for writes — it is exactly the
 * `entry.config ? { ...entry, config: nextConfig } : nextConfig` expression the
 * optimistic actions duplicated.
 *
 * @param {object|null|undefined} entry  the current collection entry.
 * @param {object} nextConfig  the new config to store.
 * @returns {object} the next collection entry.
 */
export function withConfig(entry, nextConfig) {
  return entry && entry.config ? { ...entry, config: nextConfig } : nextConfig;
}

export default unwrapConfig;
