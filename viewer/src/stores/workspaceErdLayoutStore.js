/**
 * workspaceErdLayoutStore.js — SESSION-ONLY per-scope ERD layout (build spec §6).
 *
 * Holds the user's dragged node positions and pill waypoints for the Semantic
 * Layer / Relation ERD canvases, keyed by SCOPE so two canvases never bleed:
 *   - 'semantic-layer'         the project-wide overview
 *   - 'relation:<name>'        a single relation's scoped ERD
 *   - 'relation:__all__'       the scopeAll relation ERD
 *
 * Spread into store.js OUTSIDE persist() — this is ephemeral view state (mirrors
 * the workspaceSourceOutlineExpanded session-only precedent), not config.
 *
 * Shape:
 *   workspaceErdLayout: { [scope]: { nodes: { [nodeId]: {x,y} }, waypoints: { [edgeId]: {x,y} } } }
 *   workspaceErdLayoutVersion: { [scope]: number }
 *
 * `getErdLayout(scope)` returns a STABLE empty-object identity for an untouched
 * scope so a hook depending on it doesn't churn its memo every render.
 */

// One frozen empty layout reused for every untouched scope → stable identity.
const EMPTY_LAYOUT = Object.freeze({ nodes: Object.freeze({}), waypoints: Object.freeze({}) });

const createWorkspaceErdLayoutSlice = (set, get) => ({
  workspaceErdLayout: {},
  workspaceErdLayoutVersion: {},

  /** Persist a single dragged node's position for a scope. */
  setErdNodePosition: (scope, nodeId, pos) => {
    if (!scope || !nodeId || !pos) return;
    set(state => {
      const prev = state.workspaceErdLayout[scope] || EMPTY_LAYOUT;
      return {
        workspaceErdLayout: {
          ...state.workspaceErdLayout,
          [scope]: {
            nodes: { ...prev.nodes, [nodeId]: { x: pos.x, y: pos.y } },
            waypoints: { ...prev.waypoints },
          },
        },
      };
    });
  },

  /** Batch-persist node positions (one commit per drag-stop). */
  setErdNodePositions: (scope, posMap) => {
    if (!scope || !posMap || typeof posMap !== 'object') return;
    const ids = Object.keys(posMap);
    if (ids.length === 0) return;
    set(state => {
      const prev = state.workspaceErdLayout[scope] || EMPTY_LAYOUT;
      const nextNodes = { ...prev.nodes };
      ids.forEach(id => {
        const p = posMap[id];
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
          nextNodes[id] = { x: p.x, y: p.y };
        }
      });
      return {
        workspaceErdLayout: {
          ...state.workspaceErdLayout,
          [scope]: { nodes: nextNodes, waypoints: { ...prev.waypoints } },
        },
      };
    });
  },

  /** Set or clear (pt === null) a pill waypoint override for an edge in a scope. */
  setErdEdgeWaypoint: (scope, edgeId, pt) => {
    if (!scope || !edgeId) return;
    set(state => {
      const prev = state.workspaceErdLayout[scope] || EMPTY_LAYOUT;
      const nextWaypoints = { ...prev.waypoints };
      if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
        nextWaypoints[edgeId] = { x: pt.x, y: pt.y };
      } else {
        delete nextWaypoints[edgeId];
      }
      return {
        workspaceErdLayout: {
          ...state.workspaceErdLayout,
          [scope]: { nodes: { ...prev.nodes }, waypoints: nextWaypoints },
        },
      };
    });
  },

  /**
   * Read a scope's layout. Returns a STABLE frozen-empty identity for untouched
   * scopes (so hook memos that depend on this don't churn).
   */
  getErdLayout: scope => {
    if (!scope) return EMPTY_LAYOUT;
    return get().workspaceErdLayout[scope] || EMPTY_LAYOUT;
  },

  /**
   * Tidy / reset a scope's layout: clear ALL node positions AND waypoints, and
   * bump the scope's layoutVersion so the hook recomputes a full auto-layout
   * (version-bump-as-dep is robust against stale closures).
   */
  clearErdLayout: scope => {
    if (!scope) return;
    set(state => {
      const nextLayout = { ...state.workspaceErdLayout };
      delete nextLayout[scope];
      const version = (state.workspaceErdLayoutVersion[scope] || 0) + 1;
      return {
        workspaceErdLayout: nextLayout,
        workspaceErdLayoutVersion: {
          ...state.workspaceErdLayoutVersion,
          [scope]: version,
        },
      };
    });
  },
});

export default createWorkspaceErdLayoutSlice;
