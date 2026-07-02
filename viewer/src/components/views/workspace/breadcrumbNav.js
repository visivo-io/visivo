/**
 * editPanelBreadcrumb — VIS-804 / Track G G-2.
 *
 * Pure helpers backing the right-rail Edit-panel structural breadcrumb and its
 * keyboard navigation. Kept framework-free (no React, no store) so the
 * key-derivation + nav logic is unit-testable in isolation and reused by both
 * the <EditPanelBreadcrumb> component and its keydown handler.
 *
 * SELECTION KEY GRAMMAR (the same composite key OutlineTreePanel writes):
 *   - `dashboard`                          — the dashboard chrome.
 *   - `row.<N>`                            — a top-level row.
 *   - `row.<N>.item.<M>`                   — an item in a top-level row.
 *   - `…item.<M>.row.<P>.item.<Q>`         — nested container rows/items
 *                                            (a container item carries `.rows`).
 *
 * A "segment" is one step in the ancestry chain:
 *   { key, kind, type, label }
 *     - key   — the selection key that selects THIS segment.
 *     - kind  — 'dashboard' | 'row' | 'item' | 'container'.
 *     - type  — canonical object type for icon/colour lookup
 *               ('dashboard' for the root + containers, 'row' for rows,
 *               the leaf object type — chart/table/markdown/input — for items).
 *     - label — human label ('Row 2', the chart name, the dashboard name, …).
 */

const ITEM_TYPE_KEYS = ['chart', 'table', 'markdown', 'input'];

/** Strip `${ref(name)}` / `ref(name)` / bare name → display name. */
const refToName = value => {
  if (typeof value !== 'string') return value && value.name ? value.name : null;
  const match = value.match(/ref\(\s*(?:'|")?([^'")]+)(?:'|")?\s*\)/);
  if (match) return match[1].trim();
  return value;
};

/**
 * Derive `{ type, name }` from a leaf dashboard Item (the first carrier key
 * present wins). Mirrors OutlineTreePanel.resolveItem so the breadcrumb label
 * matches the tree label exactly.
 */
const resolveLeafItem = item => {
  if (!item || typeof item !== 'object') return { type: 'chart', name: '(item)' };
  for (const key of ITEM_TYPE_KEYS) {
    const value = item[key];
    if (value === undefined || value === null || value === '') continue;
    const name = refToName(value) || `(${key})`;
    return { type: key, name };
  }
  return { type: 'chart', name: '(empty item)' };
};

/**
 * Tokenise a selection key into ordered steps:
 *   'row.0.item.1.row.0.item.2'
 *     → [{ axis:'row', index:0 }, { axis:'item', index:1 },
 *        { axis:'row', index:0 }, { axis:'item', index:2 }]
 * Returns [] for the dashboard root (or a falsy/`'dashboard'` key).
 */
export const tokenizeOutlineKey = key => {
  if (!key || typeof key !== 'string' || key === 'dashboard') return [];
  const parts = key.split('.');
  const tokens = [];
  for (let i = 0; i < parts.length - 1; i += 2) {
    const axis = parts[i];
    const index = Number(parts[i + 1]);
    if ((axis !== 'row' && axis !== 'item') || !Number.isInteger(index)) return tokens;
    tokens.push({ axis, index });
  }
  return tokens;
};

/** Re-assemble tokens into a key. Empty tokens → `'dashboard'`. */
export const tokensToKey = tokens => {
  if (!tokens || tokens.length === 0) return 'dashboard';
  return tokens.map(t => `${t.axis}.${t.index}`).join('.');
};

/**
 * Walk the dashboard `rows` along the token path, returning the list of nodes
 * touched (each `{ node, axis, index, kind }`) so labels can be derived. Stops
 * early (returns what it resolved) when the path points past the live config.
 */
export const walkTokens = (rows, tokens) => {
  const nodes = [];
  let currentRows = Array.isArray(rows) ? rows : [];
  for (let t = 0; t < tokens.length; t += 1) {
    const { axis, index } = tokens[t];
    if (axis === 'row') {
      const row = currentRows[index];
      if (!row) break;
      nodes.push({ node: row, axis, index, kind: 'row' });
      currentRows = [];
    } else {
      // item axis — the item lives on the most-recently-seen row.
      const parentRow = nodes.length ? nodes[nodes.length - 1].node : null;
      const items = Array.isArray(parentRow?.items) ? parentRow.items : [];
      const item = items[index];
      if (!item) break;
      const isContainer = Array.isArray(item?.rows) && item.rows.length > 0;
      nodes.push({ node: item, axis, index, kind: isContainer ? 'container' : 'item' });
      currentRows = isContainer ? item.rows : [];
    }
  }
  return nodes;
};

/**
 * Build the ordered breadcrumb segment list for a selection key.
 *
 * Always begins with the dashboard segment. Each subsequent segment maps to a
 * prefix of the token path so its `key` selects that ancestor.
 */
export const buildBreadcrumbSegments = (outlineKey, dashboardName, rows) => {
  const dashSegment = {
    key: 'dashboard',
    kind: 'dashboard',
    type: 'dashboard',
    label: dashboardName || 'Dashboard',
  };
  const tokens = tokenizeOutlineKey(outlineKey);
  if (tokens.length === 0) return [dashSegment];

  const walked = walkTokens(rows, tokens);
  const segments = [dashSegment];

  walked.forEach((entry, i) => {
    const prefixTokens = tokens.slice(0, i + 1);
    const key = tokensToKey(prefixTokens);
    if (entry.kind === 'row') {
      segments.push({ key, kind: 'row', type: 'row', label: `Row ${entry.index + 1}` });
    } else if (entry.kind === 'container') {
      segments.push({
        key,
        kind: 'container',
        type: 'dashboard',
        label: `Container ${entry.index + 1}`,
      });
    } else {
      const { type, name } = resolveLeafItem(entry.node);
      segments.push({ key, kind: 'item', type, label: name });
    }
  });

  // If the live config no longer contains the full path (walk stopped early),
  // the segments we DID resolve are still a valid, clickable ancestry.
  return segments;
};

/**
 * Resolve the node a selection key addresses, at ANY depth (nested container
 * rows/items included). Returns the walked entry `{ node, axis, index, kind }`
 * or `null` when the key is the dashboard root or points past the live config.
 */
export const getNodeAtKey = (rows, key) => {
  const tokens = tokenizeOutlineKey(key);
  if (tokens.length === 0) return null;
  const walked = walkTokens(rows, tokens);
  if (walked.length !== tokens.length) return null;
  return walked[walked.length - 1];
};

/**
 * Immutably replace the SIBLING ARRAY containing the node a selection key
 * addresses, at any depth. `updater(siblings)` receives the sibling array —
 * the parent's `rows` for a `row` key, the parent row's `items` for an `item`
 * key — and returns the next array. Returns the next top-level rows array
 * (the unchanged input when the key can't be resolved). Pure.
 */
export const updateSiblingsAtKey = (rows, key, updater) => {
  const tokens = tokenizeOutlineKey(key);
  const safeRows = Array.isArray(rows) ? rows : [];
  if (tokens.length === 0) return safeRows;
  const last = tokens[tokens.length - 1];
  const parentTokens = tokens.slice(0, -1);
  const siblingsProp = last.axis === 'item' ? 'items' : 'rows';

  // Top-level row key — the siblings ARE the dashboard's rows array.
  if (parentTokens.length === 0) return updater(safeRows);

  // Otherwise transform the parent node in place (immutably) along the path.
  const descend = (node, rest) => {
    if (rest.length === 0) {
      const siblings = Array.isArray(node[siblingsProp]) ? node[siblingsProp] : [];
      return { ...node, [siblingsProp]: updater(siblings) };
    }
    const { axis, index } = rest[0];
    const childProp = axis === 'item' ? 'items' : 'rows';
    const children = Array.isArray(node[childProp]) ? node[childProp] : [];
    const child = children[index];
    if (!child) return node;
    const nextChildren = [...children];
    nextChildren[index] = descend(child, rest.slice(1));
    return { ...node, [childProp]: nextChildren };
  };

  const { axis, index } = parentTokens[0];
  if (axis !== 'row') return safeRows; // top-level paths always start at a row
  const row = safeRows[index];
  if (!row) return safeRows;
  const next = [...safeRows];
  next[index] = descend(row, parentTokens.slice(1));
  return next;
};

/**
 * The number of siblings at the level the key terminates at, for the given
 * rows. Used to clamp ↑/↓ sibling stepping. Returns 0 when the key is the
 * dashboard root (no siblings).
 */
const siblingCount = (rows, tokens) => {
  if (tokens.length === 0) return 0;
  const parentTokens = tokens.slice(0, -1);
  const last = tokens[tokens.length - 1];
  if (last.axis === 'row') {
    // Rows live either at the dashboard root or under a container item.
    if (parentTokens.length === 0) return Array.isArray(rows) ? rows.length : 0;
    const walked = walkTokens(rows, parentTokens);
    const container = walked[walked.length - 1];
    return Array.isArray(container?.node?.rows) ? container.node.rows.length : 0;
  }
  // item axis — siblings are the items of the parent row.
  const walked = walkTokens(rows, parentTokens);
  const parentRow = walked[walked.length - 1];
  return Array.isArray(parentRow?.node?.items) ? parentRow.node.items.length : 0;
};

/**
 * ↑/↓ — step among siblings at the current depth. `delta` is -1 (up/prev) or
 * +1 (down/next). Wraps within the sibling range. Returns the next key, or the
 * unchanged key when there are no siblings to step to (dashboard root, or a
 * single-child level).
 */
export const computeSiblingKey = (outlineKey, rows, delta) => {
  const tokens = tokenizeOutlineKey(outlineKey);
  if (tokens.length === 0) return 'dashboard';
  const count = siblingCount(rows, tokens);
  if (count <= 1) return tokensToKey(tokens);
  const last = tokens[tokens.length - 1];
  const nextIndex = (last.index + delta + count) % count;
  const nextTokens = [...tokens.slice(0, -1), { axis: last.axis, index: nextIndex }];
  return tokensToKey(nextTokens);
};

/**
 * ←/→ — step UP / DOWN the hierarchy. `direction` is 'up' (←) or 'down' (→).
 *   - up   → the parent key (drop the last token; dashboard root is the floor).
 *   - down → the first child of the current node, when it has children.
 * Returns the unchanged key when the move isn't possible.
 */
export const computeHierarchyKey = (outlineKey, rows, direction) => {
  const tokens = tokenizeOutlineKey(outlineKey);
  if (direction === 'up') {
    if (tokens.length === 0) return 'dashboard';
    return tokensToKey(tokens.slice(0, -1));
  }
  // down — descend into the first child.
  if (tokens.length === 0) {
    // Dashboard → first row.
    if (Array.isArray(rows) && rows.length > 0) return 'row.0';
    return 'dashboard';
  }
  const walked = walkTokens(rows, tokens);
  const current = walked[walked.length - 1];
  if (!current) return tokensToKey(tokens);
  if (current.kind === 'row') {
    const items = Array.isArray(current.node?.items) ? current.node.items : [];
    if (items.length > 0) return `${tokensToKey(tokens)}.item.0`;
  } else if (current.kind === 'container') {
    const nestedRows = Array.isArray(current.node?.rows) ? current.node.rows : [];
    if (nestedRows.length > 0) return `${tokensToKey(tokens)}.row.0`;
  }
  return tokensToKey(tokens);
};

/**
 * ⌘↑/⌘↓ — reorder the selected node within its siblings. Returns a descriptor
 *   { axis, parentKey, fromIndex, toIndex }
 * (or null when the move isn't possible: dashboard root, or already at the
 * range edge). The caller applies the swap against the live config and re-keys
 * the selection to `toIndex`. `delta` is -1 (move up/earlier) or +1 (down).
 */
export const computeReorder = (outlineKey, rows, delta) => {
  const tokens = tokenizeOutlineKey(outlineKey);
  if (tokens.length === 0) return null;
  const count = siblingCount(rows, tokens);
  if (count <= 1) return null;
  const last = tokens[tokens.length - 1];
  const toIndex = last.index + delta;
  if (toIndex < 0 || toIndex >= count) return null;
  return {
    axis: last.axis,
    parentKey: tokensToKey(tokens.slice(0, -1)),
    fromIndex: last.index,
    toIndex,
  };
};

/** Immutable array swap of `from` ↔ `to`. */
const swap = (arr, from, to) => {
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

/**
 * Apply a `computeReorder` descriptor to a dashboard config, returning the next
 * config (or the unchanged config when the path can't be resolved). Reorders
 * the `rows` array at the dashboard root or a container, or the `items` array
 * of a row, depending on `op.axis`. Pure — does not mutate `config`.
 */
export const applyReorder = (config, op) => {
  if (!config || !op) return config;
  const rows = Array.isArray(config.rows) ? config.rows : [];
  const parentTokens = tokenizeOutlineKey(op.parentKey);

  // Top-level row reorder (parent is the dashboard root).
  if (op.axis === 'row' && parentTokens.length === 0) {
    return { ...config, rows: swap(rows, op.fromIndex, op.toIndex) };
  }

  // Reorder the leaf axis at the resolved parent node: a row reorders its
  // `items`, a container item reorders its `rows`.
  const reorderParent = parentNode => {
    if (op.axis === 'item') {
      const items = Array.isArray(parentNode.items) ? parentNode.items : [];
      return { ...parentNode, items: swap(items, op.fromIndex, op.toIndex) };
    }
    const nestedRows = Array.isArray(parentNode.rows) ? parentNode.rows : [];
    return { ...parentNode, rows: swap(nestedRows, op.fromIndex, op.toIndex) };
  };

  // Build a path-aware setter that, when it reaches the parent, applies
  // reorderParent. The root is the rows array itself.
  const applyAtRoot = (rootRows, tokens) => {
    if (tokens.length === 0) return rootRows;
    const { axis, index } = tokens[0];
    if (axis !== 'row') return rootRows; // top-level path always starts at a row
    const row = rootRows[index];
    if (!row) return rootRows;
    const nextRow =
      tokens.length === 1 ? reorderParent(row) : applyDeep(row, tokens.slice(1));
    const next = [...rootRows];
    next[index] = nextRow;
    return next;
  };

  const applyDeep = (node, tokens) => {
    if (tokens.length === 0) return reorderParent(node);
    const { axis, index } = tokens[0];
    if (axis === 'item') {
      const items = Array.isArray(node.items) ? node.items : [];
      const item = items[index];
      if (!item) return node;
      const nextItem =
        tokens.length === 1 ? reorderParent(item) : applyDeep(item, tokens.slice(1));
      const nextItems = [...items];
      nextItems[index] = nextItem;
      return { ...node, items: nextItems };
    }
    // row axis inside a container
    const nestedRows = Array.isArray(node.rows) ? node.rows : [];
    const row = nestedRows[index];
    if (!row) return node;
    const nextRow =
      tokens.length === 1 ? reorderParent(row) : applyDeep(row, tokens.slice(1));
    const nextRows = [...nestedRows];
    nextRows[index] = nextRow;
    return { ...node, rows: nextRows };
  };

  return { ...config, rows: applyAtRoot(rows, parentTokens) };
};
