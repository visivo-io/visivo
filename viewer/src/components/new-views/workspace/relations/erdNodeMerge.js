/**
 * erdNodeMerge.js — controlled-node reconciliation for the ERD canvases (§6).
 *
 * `mergeById(prev, seeded, saved)` decides each node's position when the hook
 * re-seeds (a model added/removed, columns hydrated, scope changed, Tidy bumped
 * the version). The clauses (spec §6, the highest-likelihood regression):
 *
 *   1. id in BOTH prev and seeded  → keep prev.position (preserves a moved or
 *      mid-drag node — never clobber in-flight).
 *   2. overlay saved[id] if present → session-persisted position wins over a
 *      fresh seed.
 *   3. genuinely NEW id (in seeded, not prev) → saved[id] ?? seeded.position
 *      (the new node gets its fresh slot).
 *   4. drop ids no longer in seeded (deleted nodes).
 *
 * Always carries the LATEST seeded `data`/`type`/`layoutSize` forward (so new
 * columns/fields/edges reflect), only the POSITION is reconciled.
 */
export function mergeById(prev, seeded, saved = {}) {
  const prevById = new Map((prev || []).map(n => [n.id, n]));
  return (seeded || []).map(seedNode => {
    const id = seedNode.id;
    const prevNode = prevById.get(id);
    const savedPos = saved?.[id];
    const savedValid = savedPos && Number.isFinite(savedPos.x) && Number.isFinite(savedPos.y);

    let position;
    if (prevNode) {
      // Clause 1: keep the in-flight/moved position; clause 2: saved overlays it.
      position = savedValid ? { x: savedPos.x, y: savedPos.y } : prevNode.position;
    } else {
      // Clause 3: a new node takes its saved slot or its fresh seed.
      position = savedValid ? { x: savedPos.x, y: savedPos.y } : seedNode.position;
    }
    // Latest data/type/size, reconciled position. (Clause 4 — dropped ids — falls
    // out: we only map over `seeded`, so removed ids are naturally absent.)
    return { ...seedNode, position };
  });
}

export default mergeById;
