import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PiX, PiArrowSquareOut } from 'react-icons/pi';
import useStore from '../../../../stores/store';
import { getTypeIcon, getTypeColors } from '../../common/objectTypeConfigs';

/**
 * LibraryRowFlipPopover — VIS-776 / Track C C3 (refined design).
 *
 * Anchored popover that flips out from a Library row to show the row's
 * full lineage neighbourhood as a ladder:
 *
 *   - Ancestors above the subject, each row `[type] [name] [icon]`,
 *     stepping LEFT as it approaches the subject so the icons form a
 *     staircase. The deepest ancestor sits at the top, furthest right.
 *   - Subject row in the middle, full-width, `[icon] [name] [type]`.
 *   - Descendants below, each row `[icon] [name] [type]`, stepping
 *     RIGHT as it gets deeper so the icons mirror the ancestor
 *     staircase.
 *
 * The deepest-direct-ancestor's row aligns its left edge with the
 * first-descendant row's left edge — the two ladders meet at the
 * subject. Direct ancestors drop a dotted L-shaped connector from
 * the left of their `[type]` pill down and inward to the subject's
 * `[icon]`.
 *
 * The selector input at the top is the user-editable handle for
 * scope: default `+name+` (both directions, unbounded). Editing it
 * (e.g. `+2name+1`) clamps the walker's depth.
 *
 * Colour + icon for every type comes from the shared
 * `objectTypeConfigs` palette so the popover matches every other
 * lineage / library / canvas surface.
 */

// Ladder geometry — chosen so even a 5–6 deep chain fits inside the
// 340 px card without horizontal scroll. The row width itself is fixed
// so each rung "floats" right (ancestors) or left (descendants) by a
// constant offset, producing the staircase.
const CARD_WIDTH = 340;
const CARD_PAD_X = 12;
const ROW_HEIGHT = 24;
const ROW_GAP = 4;
const ROW_WIDTH = 200;
const MAX_STEP = 22;
const MIN_STEP = 10;
const BASE_INDENT = 6;

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
 * Examples:
 *   "+revenue_chart+"   → unbounded ancestors + unbounded descendants
 *   "+2revenue_chart+1" → 2 ancestor levels, 1 descendant level
 *   "+revenue_chart"    → unbounded ancestors, no descendants
 *   "revenue_chart"     → just the subject row
 */
function parseSelector(text, fallbackName) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return { name: fallbackName, ancestors: 0, descendants: 0 };
  }
  const re = /^(\+(\d*))?([^+]+?)(\+(\d*))?$/;
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

  const out = [];
  const seen = new Set([`${subject.type}:${subject.name}`]);

  // Track which displayed node each upstream came in through so the
  // connector overlay can draw the actual DAG edges (parent.icon →
  // child.icon) instead of a generic chain.
  const visit = (name, depth, fromChildName) => {
    if (depth > maxDepth) return;
    const entry = index.get(name);
    if (!entry) return;
    const key = `${entry.type}:${name}`;
    if (seen.has(key)) {
      // Even if we've already pushed this node, record the additional
      // edge so a shared parent (e.g. one source feeding two models)
      // connects to every child that lists it.
      const existing = out.find(n => n.type === entry.type && n.name === name);
      if (existing && fromChildName && !existing.childNames.includes(fromChildName)) {
        existing.childNames.push(fromChildName);
      }
      return;
    }
    seen.add(key);
    // DFS: deepest node lands at the TOP of the output. We push the
    // current node AFTER recursing into its own upstreams so the row
    // order in the popover mirrors a topological walk.
    getChildItemNames(entry.obj).forEach(child => visit(child, depth + 1, name));
    out.push({
      type: entry.type,
      name,
      depth,
      isDirect: depth === 1,
      childNames: fromChildName ? [fromChildName] : [],
    });
  };

  getChildItemNames(subjectEntry.obj).forEach(child =>
    visit(child, 1, /* fromChildName */ subject.name)
  );
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

// Back-compat — VIS-780 will replace this with `<MiniLineageCard>`.
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
// Anchoring
// ---------------------------------------------------------------------------

const FALLBACK_POSITION = { top: 100, left: 100 };

const computeAnchoredPosition = anchorEl => {
  if (!anchorEl || typeof anchorEl.getBoundingClientRect !== 'function') {
    return FALLBACK_POSITION;
  }
  const rect = anchorEl.getBoundingClientRect();
  return {
    top: rect.top + rect.height / 2,
    left: rect.right + 12,
  };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const LibraryRowFlipPopover = ({
  obj,
  anchorRef,
  onClose,
  testIdPrefix = 'library-flip-popover',
}) => {
  const popoverRef = useRef(null);

  const [position, setPosition] = useState(() =>
    computeAnchoredPosition(anchorRef?.current)
  );
  const [ancestorsOpen, setAncestorsOpen] = useState(true);
  const [descendantsOpen, setDescendantsOpen] = useState(true);
  const [selectorText, setSelectorText] = useState(() => defaultSelector(obj?.name || ''));

  // Reset selector if the underlying object identity changes (e.g. the
  // popover is reused for a different row mid-mount).
  useEffect(() => {
    setSelectorText(defaultSelector(obj?.name || ''));
  }, [obj?.name]);

  useEffect(() => {
    if (!anchorRef?.current) return undefined;
    const update = () => setPosition(computeAnchoredPosition(anchorRef.current));
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [anchorRef]);

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
  const csvScriptModels = useStore(s => s.csvScriptModels);
  const localMergeModels = useStore(s => s.localMergeModels);

  // The Workspace shell preloads charts/insights/models/etc. via their
  // own slices, but `dashboards` only loads on demand. Without it the
  // descendant walker can't surface "this chart is in dashboard X".
  // Trigger a one-shot fetch when the popover mounts so descendants
  // appear on first open.
  useEffect(() => {
    if (
      (!Array.isArray(allDashboards) || allDashboards.length === 0) &&
      (!Array.isArray(dashboardsFromStore) || dashboardsFromStore.length === 0) &&
      typeof fetchDashboards === 'function'
    ) {
      fetchDashboards();
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

  const lineage = useMemo(() => {
    return buildLineageRelations(
      obj,
      {
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
      },
      scope
    );
  }, [
    obj,
    scope,
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
  ]);

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose && onClose();
    };
    const onDoc = e => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose && onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDoc);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [onClose]);

  if (!obj) return null;

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

  const ancestorMarginLeft = node =>
    BASE_INDENT + ((node.depth || 1) - 1) * STEP;
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
        if (childName === obj.name) return; // direct → handled by dotted line
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
          if (parentName === obj.name) return; // handled above as direct
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

  const connectorPath = ({ parentX, parentY, childX, childY }) =>
    `M ${parentX} ${parentY + ICON_H / 2} L ${parentX} ${childY} L ${childX} ${childY}`;

  // Dotted Γ-connector from each direct ancestor's [type] pill down and
  // then right onto the subject row's icon column. Drawn as a single
  // L-path in the SVG overlay so the corner joins cleanly.
  const dottedConnectors = [];
  if (ancestorsOpen) {
    ancestors.forEach((node, i) => {
      if (!node.isDirect) return;
      const rowLeft = ancestorMarginLeft(node);
      const startX = rowLeft - 4; // just left of the [type] pill
      const startY = ancestorRowY(i);
      // The L turns at the top of the subject row so the horizontal
      // segment lands at the subject icon column (icon center = 16:
      // subject row paddingLeft 6 + ICON_W/2).
      const subjectTopY = N * (ROW_HEIGHT + ROW_GAP);
      const subjectIconX = 6 + ICON_W / 2;
      dottedConnectors.push({
        key: `dotted-${node.name}`,
        name: node.name,
        d: `M ${startX} ${startY} L ${startX} ${subjectTopY} L ${subjectIconX} ${subjectTopY}`,
      });
    });
  }

  return createPortal(
    <div
      ref={popoverRef}
      data-testid={testIdPrefix}
      role="dialog"
      aria-label={`Lineage preview for ${obj.name}`}
      className="fixed z-50"
      style={{
        top: position.top,
        left: position.left,
        width: CARD_WIDTH,
        transform: 'translateY(-50%)',
      }}
    >
      <span
        aria-hidden="true"
        className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 rounded-sm bg-white ring-1 ring-gray-200"
      />
      <div className="relative rounded-lg bg-white shadow-lg ring-1 ring-gray-200">
        <header className="flex h-8 items-center gap-2 border-b border-gray-200 px-3">
          {(() => {
            const Icon = getTypeIcon(obj.type);
            return <Icon style={{ fontSize: 14 }} className="text-gray-500" />;
          })()}
          <span
            data-testid={`${testIdPrefix}-name`}
            className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-gray-900"
          >
            {obj.name}
          </span>
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-gray-400">
            lineage
          </span>
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
        </header>

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
                      d={connectorPath(c)}
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
                      d={connectorPath(c)}
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

              <SubjectRow subject={obj} testIdPrefix={testIdPrefix} />

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

        <footer className="flex h-8 items-center justify-between border-t border-gray-200 px-2.5 text-[11px]">
          <span className="text-gray-400" data-testid={`${testIdPrefix}-deferred-note`}>
            Full lineage in VIS-780
          </span>
          <button
            type="button"
            disabled
            title="Open the full lineage modal (VIS-D6)"
            data-testid={`${testIdPrefix}-expand`}
            className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-medium text-gray-400 disabled:opacity-60"
          >
            <PiArrowSquareOut className="h-3 w-3" />
            Expand
          </button>
        </footer>
      </div>
    </div>,
    document.body
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
  UNBOUNDED,
};
export default LibraryRowFlipPopover;
