import React, { useEffect, useMemo, useState } from 'react';
import { PiX, PiArrowSquareOut } from 'react-icons/pi';
import useStore from '../../../../stores/store';
import { getTypeIcon, getTypeColors } from '../../common/objectTypeConfigs';

/**
 * MiniLineageCard — VIS-780 / Track C C-4 (shared lineage-card body).
 *
 * The single source of truth for the "mini lineage" surface: the selector
 * input + branching ancestors/subject/descendants ladder + SVG connectors +
 * Expand-to-lens footer. Extracted from the original inline implementation in
 * `<LibraryRowFlipPopover>` (VIS-776 / C-3) so EVERY surface that wants the
 * lineage neighbourhood card renders the SAME component:
 *
 *   - `<LibraryRowFlipPopover>` (Library row flip) — anchors this card in a
 *     portaled popover next to a library row.
 *   - `<CanvasItemFlipLayer>` (Canvas item flip, D-6) — anchors the popover
 *     next to a canvas slot, which in turn renders this card.
 *
 * This component is presentation-only over the store-driven lineage walker: it
 * owns the selector/ancestor-collapse/descendant-collapse interaction state and
 * the ladder geometry, but NOT the anchoring/portal/close-on-outside-click —
 * that's the wrapper popover's job (so the card can also be embedded inline).
 *
 * Colour + icon for every type comes from the shared `objectTypeConfigs`
 * palette so the card matches every other lineage / library / canvas surface.
 */

// Ladder geometry — chosen so even a 5–6 deep chain fits inside the
// 340 px card without horizontal scroll. The row width itself is fixed
// so each rung "floats" right (ancestors) or left (descendants) by a
// constant offset, producing the staircase.
const CARD_WIDTH = 360;
const CARD_PAD_X = 12;
const ROW_HEIGHT = 24;
const ROW_GAP = 6;
const ROW_WIDTH = 210;
const MAX_STEP = 28;
const MIN_STEP = 14;
// Direct ancestors and the first descendant row both start at this left
// offset. It sits to the RIGHT of the subject row's icon (paddingLeft 6
// + icon width 20 = subject-icon-right at x=26) so the L-shaped tree
// branching from the subject icon has somewhere to land.
const BASE_INDENT = 34;

// ---------------------------------------------------------------------------
// Selector parsing — Visivo selector syntax `[+N]name[+M]`
// ---------------------------------------------------------------------------

const UNBOUNDED = Number.POSITIVE_INFINITY;

function defaultSelector(name) {
  return `+${name}+`;
}

/**
 * Parse a Visivo selector string into `{ name, ancestors, descendants }`.
 *
 * Syntax: depth digits sit OUTSIDE the `+`, the `+` always touches the
 * object name. `+` alone means "unbounded in that direction", a missing
 * `+` means "no traversal in that direction", and `N+` / `+N` clamps to
 * N levels.
 *
 *   "+revenue_chart+"    → unbounded ancestors + unbounded descendants
 *   "2+revenue_chart+1"  → 2 ancestor levels, 1 descendant level
 *   "+revenue_chart"     → unbounded ancestors, no descendants
 *   "2+revenue_chart"    → 2 ancestor levels, no descendants
 *   "revenue_chart"      → just the subject row
 *   "+monthly_revenue+"  → SWAPS the subject to `monthly_revenue` and
 *                          shows its full upstream + downstream
 */
function parseSelector(text, fallbackName) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return { name: fallbackName, ancestors: 0, descendants: 0 };
  }
  // ((\d+)?\+)?   optional leading-depth + `+`
  // ([^+]+?)      the object name (non-greedy, no `+`)
  // (\+(\d+)?)?   optional trailing `+` + descendant-depth
  const re = /^((\d+)?\+)?([^+]+?)(\+(\d+)?)?$/;
  const m = trimmed.match(re);
  if (!m) {
    return { name: fallbackName, ancestors: 0, descendants: 0 };
  }
  const ancHasPlus = Boolean(m[1]);
  const ancDigits = m[2] || '';
  const subjName = (m[3] || '').trim() || fallbackName;
  const desHasPlus = Boolean(m[4]);
  const desDigits = m[5] || '';

  const depth = (hasPlus, digits) => {
    if (!hasPlus) return 0;
    if (!digits) return UNBOUNDED;
    const n = parseInt(digits, 10);
    return Number.isFinite(n) && n >= 0 ? n : UNBOUNDED;
  };

  return {
    name: subjName,
    ancestors: depth(ancHasPlus, ancDigits),
    descendants: depth(desHasPlus, desDigits),
  };
}

// ---------------------------------------------------------------------------
// Lineage walker — uses `child_item_names` (the canonical upstream-edge
// list the backend already exposes for every object).
// ---------------------------------------------------------------------------

function getChildItemNames(obj) {
  if (!obj || !Array.isArray(obj.child_item_names)) return [];
  return obj.child_item_names.filter(Boolean);
}

/**
 * Models that don't list any upstream child explicitly inherit the project's
 * default source. Returns a list of child names augmented with the default
 * source when the object is a model with no existing source upstream.
 */
function effectiveChildNames(entryType, obj, defaultSourceName, sourceNames) {
  const raw = getChildItemNames(obj);
  if (entryType !== 'model' || !defaultSourceName) return raw;
  // If the model already references *some* source via child_item_names,
  // respect that explicit choice instead of falling back to the default.
  const hasExplicitSource = raw.some(n => sourceNames.has(n));
  if (hasExplicitSource) return raw;
  return [...raw, defaultSourceName];
}

function buildTypeIndex(storeApi) {
  const lookup = new Map();
  const register = (type, list) => {
    if (!Array.isArray(list)) return;
    list.forEach(obj => {
      if (obj && obj.name && !lookup.has(obj.name)) {
        lookup.set(obj.name, { type, obj });
      }
    });
  };
  register('source', storeApi.sources);
  register('model', storeApi.models);
  register('model', storeApi.csvScriptModels);
  register('model', storeApi.localMergeModels);
  register('dimension', storeApi.dimensions);
  register('metric', storeApi.metrics);
  register('relation', storeApi.relations);
  register('insight', storeApi.insights);
  register('chart', storeApi.charts);
  register('table', storeApi.tables);
  register('markdown', storeApi.markdowns);
  register('input', storeApi.inputs);
  register('dashboard', storeApi.allDashboards);
  return lookup;
}

function buildReverseIndex(storeApi) {
  const reverse = new Map();
  const add = (parentName, childName, parentType) => {
    if (!reverse.has(childName)) reverse.set(childName, []);
    reverse.get(childName).push({ name: parentName, type: parentType });
  };
  const scan = (type, list) => {
    if (!Array.isArray(list)) return;
    list.forEach(obj => {
      if (!obj || !obj.name) return;
      getChildItemNames(obj).forEach(childName => add(obj.name, childName, type));
    });
  };
  scan('model', storeApi.models);
  scan('model', storeApi.csvScriptModels);
  scan('model', storeApi.localMergeModels);
  scan('insight', storeApi.insights);
  scan('chart', storeApi.charts);
  scan('table', storeApi.tables);
  scan('markdown', storeApi.markdowns);
  scan('input', storeApi.inputs);
  scan('dimension', storeApi.dimensions);
  scan('metric', storeApi.metrics);
  scan('relation', storeApi.relations);
  return reverse;
}

// Dashboard items reference their members through Visivo's templated
// `${ ref(name) }` syntax, plain names, or inline object literals. This
// unwraps every variant down to the bare name so the descendant walker
// can match against the type index.
const REF_PATTERN = /\$\{\s*ref\(([^)]+)\)\s*\}/;

function unwrapRefName(ref) {
  if (!ref) return null;
  if (typeof ref === 'object') return ref.name || ref.ref || null;
  if (typeof ref !== 'string') return null;
  const m = ref.match(REF_PATTERN);
  if (m) return m[1].trim();
  return ref.trim();
}

function dashboardMembership(allDashboards) {
  const out = [];
  if (!Array.isArray(allDashboards)) return out;
  const walk = (rows, dashboardName) => {
    if (!Array.isArray(rows)) return;
    rows.forEach(row => {
      if (!row || !Array.isArray(row.items)) return;
      row.items.forEach(item => {
        if (!item) return;
        ['chart', 'table', 'markdown', 'input'].forEach(key => {
          const name = unwrapRefName(item[key]);
          if (name) out.push({ dashboard: dashboardName, member: name });
        });
        // Items may nest further rows (containers); recurse.
        if (Array.isArray(item.rows)) walk(item.rows, dashboardName);
      });
    });
  };
  allDashboards.forEach(d => {
    if (!d || !d.name) return;
    // Live API returns the structure under `config.rows`; the test seed
    // mirrors the legacy `rows` shape. Both are honored.
    walk(d.rows || d.config?.rows, d.name);
  });
  return out;
}

function buildAncestors(subject, storeApi, maxDepth = UNBOUNDED) {
  if (!subject || maxDepth <= 0) return [];
  const index = buildTypeIndex(storeApi);
  const subjectEntry = index.get(subject.name);
  if (!subjectEntry) return [];

  const defaultSourceName = storeApi.defaults?.source_name || null;
  const sourceNames = new Set(
    (storeApi.sources || []).map(s => s && s.name).filter(Boolean)
  );

  const out = [];
  const seen = new Set([`${subject.type}:${subject.name}`]);

  const visit = (name, depth, fromChildName) => {
    if (depth > maxDepth) return;
    const entry = index.get(name);
    if (!entry) return;
    const key = `${entry.type}:${name}`;
    if (seen.has(key)) {
      const existing = out.find(n => n.type === entry.type && n.name === name);
      if (existing && fromChildName && !existing.childNames.includes(fromChildName)) {
        existing.childNames.push(fromChildName);
      }
      return;
    }
    seen.add(key);
    // DFS: deepest node lands at the TOP of the output. Models that
    // don't reference a source explicitly inherit the project default.
    const childs = effectiveChildNames(entry.type, entry.obj, defaultSourceName, sourceNames);
    childs.forEach(child => visit(child, depth + 1, name));
    out.push({
      type: entry.type,
      name,
      depth,
      isDirect: depth === 1,
      isTerminal: childs.length === 0,
      childNames: fromChildName ? [fromChildName] : [],
    });
  };

  // For the subject itself we follow the same rule — a model subject with
  // no explicit source still inherits the default.
  const subjChilds = effectiveChildNames(
    subjectEntry.type,
    subjectEntry.obj,
    defaultSourceName,
    sourceNames
  );
  subjChilds.forEach(child => visit(child, 1, subject.name));
  return out;
}

function buildDescendants(subject, storeApi, maxDepth = UNBOUNDED) {
  if (!subject || maxDepth <= 0) return [];
  const reverse = buildReverseIndex(storeApi);
  const dashMembers = dashboardMembership(storeApi.allDashboards);
  const out = [];
  const seen = new Set([`${subject.type}:${subject.name}`]);

  const visit = (name, type, depth, parentName) => {
    if (depth > maxDepth) return;
    const key = `${type}:${name}`;
    if (seen.has(key)) {
      const existing = out.find(n => n.type === type && n.name === name);
      if (existing && parentName && !existing.parentNames.includes(parentName)) {
        existing.parentNames.push(parentName);
      }
      return;
    }
    seen.add(key);
    out.push({
      type,
      name,
      depth,
      isDirect: depth === 1,
      parentNames: parentName ? [parentName] : [],
    });
    (reverse.get(name) || []).forEach(p => visit(p.name, p.type, depth + 1, name));
    dashMembers
      .filter(m => m.member === name)
      .forEach(m => visit(m.dashboard, 'dashboard', depth + 1, name));
  };

  (reverse.get(subject.name) || []).forEach(p =>
    visit(p.name, p.type, 1, subject.name)
  );
  dashMembers
    .filter(m => m.member === subject.name)
    .forEach(m => visit(m.dashboard, 'dashboard', 1, subject.name));
  return out;
}

function buildLineageRelations(subject, storeApi, scope = {}) {
  const ancestorDepth = scope.ancestors ?? UNBOUNDED;
  const descendantDepth = scope.descendants ?? UNBOUNDED;
  return {
    ancestors: buildAncestors(subject, storeApi, ancestorDepth),
    descendants: buildDescendants(subject, storeApi, descendantDepth),
  };
}

// Back-compat helper retained from the original inline implementation.
function buildChainFromStore(subject, storeApi) {
  return buildAncestors(subject, storeApi, UNBOUNDED);
}

// ---------------------------------------------------------------------------
// Row primitives — pull tone classes straight from `objectTypeConfigs`
// so this surface stays colour-locked with the rest of the viewer.
// ---------------------------------------------------------------------------

function toneFor(type) {
  const c = getTypeColors(type) || {};
  return {
    pill: `${c.bg || 'bg-gray-100'} ${c.text || 'text-gray-800'}`,
    tile: `${c.node || 'bg-gray-50 border-gray-200'} ${c.text || 'text-gray-800'}`,
  };
}

const TypePill = ({ type }) => {
  const tone = toneFor(type);
  return (
    <span
      className={[
        'inline-flex h-4 shrink-0 items-center rounded-sm px-1 text-[8.5px] font-bold uppercase tracking-wider',
        tone.pill,
      ].join(' ')}
    >
      {type}
    </span>
  );
};

const IconTile = ({ type }) => {
  const tone = toneFor(type);
  const Icon = getTypeIcon(type);
  return (
    <span
      className={[
        'relative z-10 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border',
        tone.tile,
      ].join(' ')}
    >
      <Icon style={{ fontSize: 12 }} />
    </span>
  );
};

const AncestorRow = ({ node, marginLeft, testIdPrefix }) => (
  <li
    data-testid={`${testIdPrefix}-lineage-${node.type}-${node.name}`}
    data-direction="ancestor"
    data-direct={node.isDirect ? 'true' : 'false'}
    className="relative flex items-center gap-2"
    style={{
      height: ROW_HEIGHT,
      width: ROW_WIDTH,
      marginLeft,
    }}
  >
    <TypePill type={node.type} />
    <span className="min-w-0 flex-1 truncate text-center text-[11.5px] font-medium text-gray-800">
      {node.name}
    </span>
    <IconTile type={node.type} />
  </li>
);

const DescendantRow = ({ node, marginLeft, testIdPrefix }) => (
  <li
    data-testid={`${testIdPrefix}-lineage-${node.type}-${node.name}`}
    data-direction="descendant"
    data-direct={node.isDirect ? 'true' : 'false'}
    className="relative flex items-center gap-2"
    style={{
      height: ROW_HEIGHT,
      width: ROW_WIDTH,
      marginLeft,
    }}
  >
    <IconTile type={node.type} />
    <span className="min-w-0 flex-1 truncate text-center text-[11.5px] font-medium text-gray-800">
      {node.name}
    </span>
    <TypePill type={node.type} />
  </li>
);

const SubjectRow = ({ subject, testIdPrefix }) => {
  const tone = toneFor(subject.type);
  return (
    <li
      data-testid={`${testIdPrefix}-lineage-subject`}
      data-direction="subject"
      className={[
        'relative flex items-center self-stretch rounded-md ring-1 ring-[#713b57]/40',
        tone.pill,
      ].join(' ')}
      style={{ height: ROW_HEIGHT + 4, paddingLeft: 6, paddingRight: 6 }}
    >
      <IconTile type={subject.type} />
      <span className="flex-1 text-center text-[11.5px] font-semibold text-gray-900 truncate min-w-0 px-2">
        {subject.name}
      </span>
      <TypePill type={subject.type} />
    </li>
  );
};

// ---------------------------------------------------------------------------
// Component — the lineage card body. Presentation-only: anchoring + portal +
// close-on-outside-click belong to the wrapping popover.
// ---------------------------------------------------------------------------

const MiniLineageCard = ({
  obj,
  onClose,
  onExpand,
  showHeader = true,
  showFooter = true,
  testIdPrefix = 'mini-lineage-card',
}) => {
  const [ancestorsOpen, setAncestorsOpen] = useState(true);
  const [descendantsOpen, setDescendantsOpen] = useState(true);
  const [selectorText, setSelectorText] = useState(() => defaultSelector(obj?.name || ''));

  // Reset selector if the underlying object identity changes (e.g. the
  // card is reused for a different row mid-mount).
  useEffect(() => {
    setSelectorText(defaultSelector(obj?.name || ''));
  }, [obj?.name]);

  const charts = useStore(s => s.charts);
  const insights = useStore(s => s.insights);
  const models = useStore(s => s.models);
  const tables = useStore(s => s.tables);
  const sources = useStore(s => s.sources);
  const dimensions = useStore(s => s.dimensions);
  const metrics = useStore(s => s.metrics);
  const relationsList = useStore(s => s.relations);
  const markdowns = useStore(s => s.markdowns);
  const inputs = useStore(s => s.inputs);
  const allDashboards = useStore(s => s.allDashboards);
  const dashboardsFromStore = useStore(s => s.dashboards);
  const fetchDashboards = useStore(s => s.fetchDashboards);
  const openWorkspaceTab = useStore(s => s.openWorkspaceTab);
  const setWorkspaceLens = useStore(s => s.setWorkspaceLens);
  const csvScriptModels = useStore(s => s.csvScriptModels);
  const localMergeModels = useStore(s => s.localMergeModels);
  const defaults = useStore(s => s.defaults);
  const fetchDefaults = useStore(s => s.fetchDefaults);

  // The Workspace shell preloads charts/insights/models/etc. via their
  // own slices, but `dashboards` only loads on demand. Without it the
  // descendant walker can't surface "this chart is in dashboard X".
  // Trigger a one-shot fetch when the card mounts so descendants appear
  // on first open.
  useEffect(() => {
    if (
      (!Array.isArray(allDashboards) || allDashboards.length === 0) &&
      (!Array.isArray(dashboardsFromStore) || dashboardsFromStore.length === 0) &&
      typeof fetchDashboards === 'function'
    ) {
      fetchDashboards();
    }
    if (!defaults && typeof fetchDefaults === 'function') {
      fetchDefaults();
    }
    // We intentionally run only once per mount — refetches handled
    // elsewhere by save flows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Coalesce the two dashboard sources so the walker sees membership
  // edges no matter which slice happens to be populated.
  const dashboardsForWalker = useMemo(() => {
    const seen = new Set();
    const out = [];
    [allDashboards, dashboardsFromStore].forEach(list => {
      if (!Array.isArray(list)) return;
      list.forEach(d => {
        if (!d || !d.name || seen.has(d.name)) return;
        seen.add(d.name);
        out.push(d);
      });
    });
    return out;
  }, [allDashboards, dashboardsFromStore]);

  const scope = useMemo(
    () => parseSelector(selectorText, obj?.name || ''),
    [selectorText, obj?.name]
  );

  const storeApi = useMemo(
    () => ({
      charts,
      insights,
      models,
      tables,
      sources,
      dimensions,
      metrics,
      relations: relationsList,
      markdowns,
      inputs,
      allDashboards: dashboardsForWalker,
      csvScriptModels,
      localMergeModels,
      defaults,
    }),
    [
      charts,
      insights,
      models,
      tables,
      sources,
      dimensions,
      metrics,
      relationsList,
      markdowns,
      inputs,
      dashboardsForWalker,
      csvScriptModels,
      localMergeModels,
      defaults,
    ]
  );

  // The selector input is allowed to swap the SUBJECT in addition to
  // clamping depths. When the parsed name resolves to an object in the
  // store and isn't the row's own name, we render that object as the
  // subject (so a user can chase a name they spot in the lineage).
  const effectiveSubject = useMemo(() => {
    if (!scope.name || !obj || scope.name === obj.name) return obj;
    const index = buildTypeIndex(storeApi);
    const hit = index.get(scope.name);
    if (hit) return { type: hit.type, name: scope.name };
    return obj;
  }, [scope.name, obj, storeApi]);

  const lineage = useMemo(() => {
    return buildLineageRelations(effectiveSubject, storeApi, scope);
  }, [effectiveSubject, scope, storeApi]);

  if (!obj) return null;

  const subjectForRender = effectiveSubject || obj;

  // "Expand" hands the current subject off to the Workspace middle pane's
  // universal lineage lens (E-1): open the subject as a workspace tab, flip
  // the lens to lineage, then dismiss. Callers may override with `onExpand`.
  const handleExpand = () => {
    const { type, name } = subjectForRender;
    if (typeof onExpand === 'function') {
      onExpand(subjectForRender);
    } else {
      if (typeof openWorkspaceTab === 'function') {
        openWorkspaceTab({ id: `${type}:${name}`, type, name });
      }
      if (typeof setWorkspaceLens === 'function') {
        setWorkspaceLens('lineage');
      }
    }
    onClose && onClose();
  };
  const ancestors = lineage.ancestors;
  const descendants = lineage.descendants;
  const N = ancestors.length;
  const M = descendants.length;
  const isEmpty = N === 0 && M === 0;

  // Positioning is depth-based, not display-index-based. Every node at
  // the same lineage depth (e.g. two sibling insights that both feed
  // the subject directly) shares the same horizontal slot — that's
  // what makes a true staircase. The marginLeft grows by STEP for each
  // additional depth level so the deepest ancestor sits furthest right
  // and the direct level shares its left edge with the first descendant.
  const cardContentWidth = CARD_WIDTH - CARD_PAD_X * 2;
  const availableShift = Math.max(0, cardContentWidth - ROW_WIDTH - BASE_INDENT);
  const stepForMaxDepth = maxDepth => {
    if (maxDepth <= 1) return 0;
    return Math.max(MIN_STEP, Math.min(MAX_STEP, Math.floor(availableShift / (maxDepth - 1))));
  };
  // Unified step across both ladders — the direct-ancestor row and the
  // direct-descendant row must share the same left edge (rule 4), and
  // each successive depth step must move the same distance regardless
  // of which side of the subject the row is on.
  const ancestorMaxDepth = ancestors.reduce((acc, n) => Math.max(acc, n.depth || 1), 1);
  const descendantMaxDepth = descendants.reduce((acc, n) => Math.max(acc, n.depth || 1), 1);
  const sharedMaxDepth = Math.max(ancestorMaxDepth, descendantMaxDepth);
  const STEP = stepForMaxDepth(sharedMaxDepth);

  // Terminal ancestors (nodes with no upstream of their own) align to
  // the deepest visual column regardless of their actual distance from
  // the subject. Otherwise a direct ancestor with no parent would sit
  // at depth 1 directly under whatever ancestor happens to be at
  // depth 2 above it, which falsely implies a chain. Bumping terminals
  // to the rightmost column makes "this is a leaf of the upstream
  // tree" the visual reading.
  const ancestorEffectiveDepth = node =>
    node.isTerminal ? ancestorMaxDepth : (node.depth || 1);
  const ancestorMarginLeft = node =>
    BASE_INDENT + (ancestorEffectiveDepth(node) - 1) * STEP;
  const descendantMarginLeft = node =>
    BASE_INDENT + ((node.depth || 1) - 1) * STEP;


  // SVG connector overlay — draws the actual DAG edges so the icon
  // staircase visually reads as the lineage tree it represents.
  const ICON_W = 20;
  const ICON_H = 20;
  const ancestorIconCenter = node => ({
    x: ancestorMarginLeft(node) + ROW_WIDTH - ICON_W / 2,
  });
  const descendantIconCenter = node => ({
    x: descendantMarginLeft(node) + ICON_W / 2,
  });

  const ancestorByName = new Map();
  ancestors.forEach((node, i) => ancestorByName.set(node.name, { node, index: i }));
  const descendantByName = new Map();
  descendants.forEach((node, j) => descendantByName.set(node.name, { node, index: j }));

  const ancestorRowY = i => i * (ROW_HEIGHT + ROW_GAP) + ROW_HEIGHT / 2;
  const subjectY = N * (ROW_HEIGHT + ROW_GAP) + (ROW_HEIGHT + 4) / 2;
  const subjectBottomY = N * (ROW_HEIGHT + ROW_GAP) + (ROW_HEIGHT + 4);
  const descendantRowY = j =>
    subjectBottomY + ROW_GAP + j * (ROW_HEIGHT + ROW_GAP) + ROW_HEIGHT / 2;

  const ancestorConnectors = [];
  if (ancestorsOpen) {
    ancestors.forEach((parent, parentIdx) => {
      (parent.childNames || []).forEach(childName => {
        if (childName === subjectForRender.name) return; // direct → handled by dotted line
        const child = ancestorByName.get(childName);
        if (!child) return;
        ancestorConnectors.push({
          key: `anc-edge-${parent.name}-${childName}`,
          parentX: ancestorIconCenter(parent).x,
          parentY: ancestorRowY(parentIdx),
          childX: ancestorIconCenter(child.node).x,
          childY: ancestorRowY(child.index),
        });
      });
    });
  }

  const descendantConnectors = [];
  if (descendantsOpen) {
    descendants.forEach((node, idx) => {
      if (node.isDirect) {
        descendantConnectors.push({
          key: `dsc-edge-subject-${node.name}`,
          parentX: 6 + ICON_W / 2, // subject row icon center (paddingLeft 6 + half-icon)
          parentY: subjectY,
          childX: descendantIconCenter(node).x,
          childY: descendantRowY(idx),
        });
      } else {
        (node.parentNames || []).forEach(parentName => {
          if (parentName === subjectForRender.name) return; // handled above as direct
          const parent = descendantByName.get(parentName);
          if (!parent) return;
          descendantConnectors.push({
            key: `dsc-edge-${parentName}-${node.name}`,
            parentX: descendantIconCenter(parent.node).x,
            parentY: descendantRowY(parent.index),
            childX: descendantIconCenter(node).x,
            childY: descendantRowY(idx),
          });
        });
      }
    });
  }

  // Ancestor edges read as an inverse-L: drop straight down from the
  // parent icon's bottom-center, then bend LEFT into the child icon's
  // right edge. When several children share a parent they all hang off
  // the same vertical "trunk" (the parent icon's center X) and each
  // gets its own horizontal arm — a real downward branching tree.
  const ancestorConnectorPath = ({ parentX, parentY, childX, childY }) => {
    const childRightEdge = childX + ICON_W / 2;
    return (
      `M ${parentX} ${parentY + ICON_H / 2}` +
      ` L ${parentX} ${childY}` +
      ` L ${childRightEdge} ${childY}`
    );
  };

  // Descendants live on the LEFT side of each row. The connector reads
  // naturally as a drop from the parent icon's bottom into the child
  // icon's top — no wrap-around needed because there's nothing in the
  // way (the icons are first in their rows so the L bend lands cleanly
  // on the child icon's left edge).
  const descendantConnectorPath = ({ parentX, parentY, childX, childY }) =>
    `M ${parentX} ${parentY + ICON_H / 2} L ${parentX} ${childY} L ${childX} ${childY}`;

  // Dotted Γ-connectors from each direct ancestor's [type] pill across
  // to the subject icon column and then DOWN to the top of the subject
  // pill. When more than one direct ancestor exists we draw ONE shared
  // vertical trunk at the subject icon column and just one horizontal
  // arm per ancestor — otherwise multiple independent Γs overlap their
  // vertical segments and produce a solid stripe rather than a tree.
  const dottedConnectors = [];
  if (ancestorsOpen) {
    const directs = ancestors
      .map((node, i) => ({ node, i }))
      .filter(entry => entry.node.isDirect);
    if (directs.length > 0) {
      const subjectIconX = 6 + ICON_W / 2;
      const subjectTopY = N * (ROW_HEIGHT + ROW_GAP);
      const topmostDirectY = ancestorRowY(directs[0].i);

      // Shared vertical "trunk" drops from the topmost direct ancestor's
      // row mid down to the top of the subject row, then meets the
      // subject icon column.
      dottedConnectors.push({
        key: 'dotted-trunk',
        name: 'trunk',
        d: `M ${subjectIconX} ${topmostDirectY} L ${subjectIconX} ${subjectTopY}`,
      });

      // One horizontal arm per direct ancestor — meets the trunk at the
      // ancestor row's mid.
      directs.forEach(({ node, i }) => {
        const rowLeft = ancestorMarginLeft(node);
        const startX = rowLeft - 4;
        const rowMidY = ancestorRowY(i);
        dottedConnectors.push({
          key: `dotted-${node.name}`,
          name: node.name,
          d: `M ${startX} ${rowMidY} L ${subjectIconX} ${rowMidY}`,
        });
      });
    }
  }

  const headerIconType = subjectForRender.type;

  return (
    <div className="relative rounded-lg bg-white shadow-lg ring-1 ring-gray-200">
      {showHeader && (
        <header className="flex h-8 items-center gap-2 border-b border-gray-200 px-3">
          {(() => {
            const Icon = getTypeIcon(headerIconType);
            return <Icon style={{ fontSize: 14 }} className="text-gray-500" />;
          })()}
          <span
            data-testid={`${testIdPrefix}-name`}
            className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-gray-900"
          >
            {subjectForRender.name}
          </span>
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-gray-400">
            lineage
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close"
              aria-label="Close lineage preview"
              data-testid={`${testIdPrefix}-close`}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <PiX className="h-3 w-3" />
            </button>
          )}
        </header>
      )}

      <div className="shrink-0 px-3 pt-2">
        <div
          className="flex h-7 items-center gap-1.5 rounded-md bg-gray-50 px-2 ring-1 ring-gray-200 focus-within:ring-[#713b57]/40"
          data-testid={`${testIdPrefix}-selector`}
        >
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            sel
          </span>
          <input
            type="text"
            value={selectorText}
            onChange={e => setSelectorText(e.target.value)}
            spellCheck={false}
            aria-label="Lineage selector — edit to change depth in either direction"
            data-testid={`${testIdPrefix}-selector-input`}
            className="min-w-0 flex-1 truncate bg-transparent font-mono text-[11px] text-gray-800 placeholder-gray-400 outline-none"
            placeholder={defaultSelector(obj.name)}
          />
        </div>
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto py-2"
        style={{ maxHeight: 320, paddingLeft: CARD_PAD_X, paddingRight: CARD_PAD_X }}
        data-testid={`${testIdPrefix}-body`}
      >
        {isEmpty ? (
          <p
            className="px-1 py-2 text-[11px] italic text-gray-500"
            data-testid={`${testIdPrefix}-empty`}
          >
            No lineage available for this object.
          </p>
        ) : (
          <div className="relative" data-testid={`${testIdPrefix}-chain-wrap`}>
            {(ancestorConnectors.length > 0 ||
              descendantConnectors.length > 0 ||
              dottedConnectors.length > 0) && (
              <svg
                aria-hidden="true"
                data-testid={`${testIdPrefix}-connectors`}
                className="pointer-events-none absolute inset-0"
                width="100%"
                height="100%"
                style={{ overflow: 'visible' }}
              >
                {ancestorConnectors.map(c => (
                  <path
                    key={c.key}
                    d={ancestorConnectorPath(c)}
                    stroke="#9ca3af"
                    strokeWidth={1.5}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
                {descendantConnectors.map(c => (
                  <path
                    key={c.key}
                    d={descendantConnectorPath(c)}
                    stroke="#9ca3af"
                    strokeWidth={1.5}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
                {dottedConnectors.map(c => (
                  <path
                    key={c.key}
                    d={c.d}
                    data-testid={`${testIdPrefix}-dotted-${c.name}`}
                    stroke="#6b7280"
                    strokeWidth={1.5}
                    strokeDasharray="2 3"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </svg>
            )}
            <ul
              className="relative flex flex-col"
              style={{ rowGap: ROW_GAP }}
              data-testid={`${testIdPrefix}-chain`}
            >
            {N > 0 && (
              <li
                data-testid={`${testIdPrefix}-ancestors`}
                data-collapsed={ancestorsOpen ? 'false' : 'true'}
              >
                <button
                  type="button"
                  onClick={() => setAncestorsOpen(v => !v)}
                  aria-expanded={ancestorsOpen}
                  aria-label={
                    ancestorsOpen ? 'Collapse ancestors' : 'Expand ancestors'
                  }
                  data-testid={`${testIdPrefix}-ancestors-toggle`}
                  className="block w-full cursor-pointer text-left"
                >
                  {ancestorsOpen ? (
                    <ul
                      className="flex flex-col"
                      style={{ rowGap: ROW_GAP }}
                    >
                      {ancestors.map((node, i) => (
                        <AncestorRow
                          key={`anc-${node.type}-${node.name}-${i}`}
                          node={node}
                          marginLeft={ancestorMarginLeft(node)}
                          testIdPrefix={testIdPrefix}
                        />
                      ))}
                    </ul>
                  ) : (
                    <span
                      className="inline-flex h-4 items-center rounded bg-gray-100 px-1.5 text-[9.5px] font-medium uppercase tracking-wider text-gray-500"
                      style={{ marginLeft: BASE_INDENT }}
                    >
                      +{N} upstream
                    </span>
                  )}
                </button>
              </li>
            )}

            <SubjectRow subject={subjectForRender} testIdPrefix={testIdPrefix} />

            {M > 0 && (
              <li
                data-testid={`${testIdPrefix}-descendants`}
                data-collapsed={descendantsOpen ? 'false' : 'true'}
              >
                <button
                  type="button"
                  onClick={() => setDescendantsOpen(v => !v)}
                  aria-expanded={descendantsOpen}
                  aria-label={
                    descendantsOpen
                      ? 'Collapse descendants'
                      : 'Expand descendants'
                  }
                  data-testid={`${testIdPrefix}-descendants-toggle`}
                  className="block w-full cursor-pointer text-left"
                >
                  {descendantsOpen ? (
                    <ul
                      className="flex flex-col"
                      style={{ rowGap: ROW_GAP }}
                    >
                      {descendants.map((node, j) => (
                        <DescendantRow
                          key={`desc-${node.type}-${node.name}-${j}`}
                          node={node}
                          marginLeft={descendantMarginLeft(node)}
                          testIdPrefix={testIdPrefix}
                        />
                      ))}
                    </ul>
                  ) : (
                    <span
                      className="inline-flex h-4 items-center rounded bg-gray-100 px-1.5 text-[9.5px] font-medium uppercase tracking-wider text-gray-500"
                      style={{ marginLeft: BASE_INDENT }}
                    >
                      +{M} downstream
                    </span>
                  )}
                </button>
              </li>
            )}
            </ul>
          </div>
        )}
      </div>

      {showFooter && (
        <footer className="flex h-8 items-center justify-between border-t border-gray-200 px-2.5 text-[11px]">
          <span className="text-gray-400" data-testid={`${testIdPrefix}-deferred-note`}>
            Open full lineage
          </span>
          <button
            type="button"
            onClick={handleExpand}
            title="Open this object's full lineage in the workspace lineage lens"
            aria-label="Open full lineage in the workspace lineage lens"
            data-testid={`${testIdPrefix}-expand`}
            className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-medium text-primary-600 hover:bg-primary-50"
          >
            <PiArrowSquareOut className="h-3 w-3" />
            Expand
          </button>
        </footer>
      )}
    </div>
  );
};

export {
  buildChainFromStore,
  buildLineageRelations,
  parseSelector,
  defaultSelector,
  ROW_HEIGHT,
  ROW_GAP,
  ROW_WIDTH,
  BASE_INDENT,
  CARD_WIDTH,
  UNBOUNDED,
};
export default MiniLineageCard;
