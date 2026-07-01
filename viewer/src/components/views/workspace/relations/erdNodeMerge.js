/**
 * erdNodeMerge.js — controlled-node reconciliation for the ERD canvases (§6).
 *
 * `mergeById(prev, seeded, saved)` decides each node's position when the hook
 * re-seeds (a model added/removed, columns hydrated, scope changed, Tidy bumped
 * the version). The clauses:
 *
 *   1. SAVED id (user moved it) → its saved position wins, whether or not it was
 *      in prev. This preserves a moved card across any re-seed.
 *   2. id in prev but NOT saved → keep prev.position ONLY when the fresh seed
 *      hasn't moved it (a stable auto-seed); otherwise adopt the fresh seed. This
 *      lets a late column-hydration / model-add re-pack un-moved cards (else a
 *      stale estimate freezes a too-short slot and the taller card overlaps its
 *      neighbour) while never clobbering a mid-drag node (the sync effect doesn't
 *      run mid-drag — onNodesChange owns live positions — so prev === seed there).
 *   3. genuinely NEW id (in seeded, not prev, not saved) → seeded.position (fresh
 *      slot).
 *   4. drop ids no longer in seeded (deleted nodes).
 *
 * Always carries the LATEST seeded `data`/`type`/`layoutSize` forward (so new
 * columns/fields/edges reflect); only the POSITION is reconciled.
 *
 * CRITICAL: when a node already existed, we PRESERVE the React-Flow-measured
 * fields (`width`/`height`/`positionAbsolute` — written onto the controlled node
 * by `applyNodeChanges` after RF's ResizeObserver fires). A re-seed rebuilt from
 * the layout output alone carries NO width/height, so RF would mark the node
 * unmeasured and set `visibility:hidden`; because the rendered size is unchanged
 * the ResizeObserver never re-fires, so the node would stay hidden forever (a
 * blank canvas when columns hydrate after first paint). Starting from `prevNode`
 * keeps the measurement intact; RF re-measures only if the real size changes.
 */
export function mergeById(prev, seeded, saved = {}) {
  const prevById = new Map((prev || []).map(n => [n.id, n]));
  return (seeded || []).map(seedNode => {
    const id = seedNode.id;
    const prevNode = prevById.get(id);
    const savedPos = saved?.[id];
    const savedValid = savedPos && Number.isFinite(savedPos.x) && Number.isFinite(savedPos.y);

    let position;
    if (savedValid) {
      // Clause 1: a user-moved card keeps its saved position, always.
      position = { x: savedPos.x, y: savedPos.y };
    } else if (prevNode) {
      // Clause 2: keep the prior auto-seed position, but adopt the fresh seed
      // when the layout machine re-packed this card (e.g. columns hydrated and
      // the card grew). The sync effect never runs mid-drag, so prev here is a
      // settled auto-seed, never an in-flight drag.
      position = seedNode.position || prevNode.position;
    } else {
      // Clause 3: a new node takes its fresh slot.
      position = seedNode.position;
    }

    if (prevNode) {
      // Start from prevNode to preserve RF's measured fields (width/height/
      // positionAbsolute/internals), then overlay the latest seeded content +
      // reconciled position. (Clause 4 — dropped ids — falls out: we map over
      // `seeded`, so removed ids are naturally absent.)
      return {
        ...prevNode,
        data: seedNode.data,
        type: seedNode.type,
        layoutSize: seedNode.layoutSize,
        position,
      };
    }
    // New node: take it as-seeded (RF will measure it on mount).
    return { ...seedNode, position };
  });
}

export default mergeById;
