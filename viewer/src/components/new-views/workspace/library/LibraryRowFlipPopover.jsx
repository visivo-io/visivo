import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PiX, PiArrowSquareOut } from 'react-icons/pi';
import useStore from '../../../../stores/store';
import { getTypeIcon } from '../../common/objectTypeConfigs';
import { LAYOUT_TYPES } from './LibraryRow';

/**
 * LibraryRowFlipPopover — VIS-776 / Track C C3 (refined design).
 *
 * Anchored popover that flips out from a Library row to show the row's
 * lineage neighbourhood as a ladder: ancestors above (right-aligned,
 * widening toward the subject), the selected subject row in the middle
 * (full width), and descendants below (left-aligned, widening away from
 * the subject). The two ladders meet at the subject row.
 *
 * Layout rules (per the final mock):
 *   1. Ancestor row order  : [type] [name] [icon] — right-aligned.
 *   2. Descendant row order: [icon] [name] [type] — left-aligned.
 *   3. Each successive ancestor row (top → bottom) shifts left by `STEP`.
 *   4. The deepest-nested ancestor row's left edge matches the first
 *      descendant row's left edge, so the two ladders mirror at the
 *      subject row.
 *   5. A dotted line drops from the left of each direct-ancestor's
 *      `[type]` pill down to the top of the subject row's icon column.
 *   6. The subject row pins `[icon]` left, `[type]` right, and centres
 *      `[name]` between them. No `THIS` chip.
 *
 * Behaviour:
 *   - Click the ancestors region → collapses ancestors.
 *   - Click the descendants region → collapses descendants.
 *   - The body is `overflow-y-auto` with a fixed max-height; the
 *     collapse + scroll combination keeps complex DAGs usable in a
 *     small surface.
 *
 * The data walker is intentionally a subset of the full Lineage DAG —
 * it's the C-3 placeholder until VIS-D6 ships the shared
 * `<MiniLineageCard>` and VIS-780 (C-4) migrates this popover to it.
 */

// Two tone palettes mirror the Library section colours: mulberry for
// Layout-section types (chart / table / markdown / input) and teal for
// Data-section types (sources, models, dimensions, metrics, relations,
// insights). Dashboards default to mulberry since they belong to the
// layout side of the world.
const MULBERRY_TONE = {
  iconBg: 'bg-[#e2d7dd]/70',
  iconFg: 'text-[#713b57]',
  pillBg: 'bg-[#e2d7dd]',
  pillFg: 'text-[#5a2f45]',
};
const TEAL_TONE = {
  iconBg: 'bg-[#d4e1e2]/70',
  iconFg: 'text-[#1b4042]',
  pillBg: 'bg-[#d4e1e2]',
  pillFg: 'text-[#1b4042]',
};

// Sources sit in the data layer but get a warm highlight in the mock so
// the originating system stands out at the top of the chain.
const ORANGE_TONE = {
  iconBg: 'bg-[#f4d6cc]/80',
  iconFg: 'text-[#a44326]',
  pillBg: 'bg-[#f4d6cc]',
  pillFg: 'text-[#a44326]',
};

const getTone = type => {
  if (type === 'source') return ORANGE_TONE;
  if (LAYOUT_TYPES.includes(type) || type === 'dashboard') return MULBERRY_TONE;
  return TEAL_TONE;
};

const getIcon = type => getTypeIcon(type);

// Ladder geometry. ROW_HEIGHT × ROW_GAP must stay in sync with the
// classes on the row containers below — the dotted-connector heights
// are computed analytically from these constants.
const ROW_HEIGHT = 22; // h-[22px]
const ROW_GAP = 2; // gap-[2px]
const STEP = 18; // per-rung left/right shift
const BASE_INDENT = 12; // where the lowest ancestor + first descendant align
const CARD_WIDTH = 340;

// ---------------------------------------------------------------------------
// Relations walker
// ---------------------------------------------------------------------------

// Lineage edges come straight from each store object's `child_item_names`
// array — that's the canonical "what does this depend on" list the backend
// already publishes for every chart / table / insight / model / source.
// Walking it gives us the full upstream DAG without having to inspect the
// per-type config blobs (which embed refs as `${ref(name).column}` and
// would otherwise need SQL-style ref parsing).
function getChildItemNames(obj) {
  if (!obj || !Array.isArray(obj.child_item_names)) return [];
  return obj.child_item_names.filter(Boolean);
}

/**
 * Build a name → type index over every collection the store exposes. Lets
 * us resolve a raw `child_item_names` entry back to its typed object so the
 * walker can keep traversing upstream.
 */
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

/**
 * Walk upstream from the subject via `child_item_names`. The traversal is
 * topological-on-the-fly: a parent node is only emitted once all of its own
 * upstreams have been emitted, so direct ancestors land last (closest to
 * the subject in the rendered ladder).
 */
function buildAncestors(subject, storeApi) {
  if (!subject) return [];
  const index = buildTypeIndex(storeApi);
  const subjectEntry = index.get(subject.name);
  const subjectObj = subjectEntry?.obj;
  if (!subjectObj) return [];

  const directNames = new Set(getChildItemNames(subjectObj));
  const out = [];
  const seen = new Set([`${subject.type}:${subject.name}`]);

  const visit = name => {
    const entry = index.get(name);
    if (!entry) return;
    const key = `${entry.type}:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    // Emit upstreams first so the deepest node sits at the top of the
    // ladder; direct children of the subject sit just above the subject.
    getChildItemNames(entry.obj).forEach(visit);
    out.push({ type: entry.type, name, isDirect: directNames.has(name) });
  };

  directNames.forEach(visit);
  return out;
}

/**
 * Build a reverse adjacency — for any name, who lists it as a child? Lets
 * us walk descendants in O(N) regardless of which type the subject is.
 */
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

/**
 * Some dashboards aren't surfaced through `child_item_names` on their
 * descendants — the relationship lives in the dashboard's `rows`/`items`
 * tree. Scan once and produce a flat list of `(dashboardName → memberName)`
 * edges so descendant traversal can include them.
 */
function dashboardMembership(allDashboards) {
  const out = [];
  if (!Array.isArray(allDashboards)) return out;
  allDashboards.forEach(d => {
    if (!d || !Array.isArray(d.rows)) return;
    d.rows.forEach(row => {
      if (!row || !Array.isArray(row.items)) return;
      row.items.forEach(item => {
        if (!item) return;
        ['chart', 'table', 'markdown'].forEach(key => {
          const ref = item[key];
          if (!ref) return;
          const refName = typeof ref === 'string' ? ref : ref.name || ref.ref;
          if (refName) out.push({ dashboard: d.name, member: refName });
        });
      });
    });
  });
  return out;
}

function buildDescendants(subject, storeApi) {
  if (!subject) return [];
  const reverse = buildReverseIndex(storeApi);
  const dashMembers = dashboardMembership(storeApi.allDashboards);
  const out = [];
  const seen = new Set([`${subject.type}:${subject.name}`]);

  const directParents = reverse.get(subject.name) || [];
  const directDashboards = dashMembers
    .filter(m => m.member === subject.name)
    .map(m => ({ name: m.dashboard, type: 'dashboard' }));
  const directSet = new Set(
    [...directParents, ...directDashboards].map(p => `${p.type}:${p.name}`)
  );

  const visit = (name, type) => {
    const key = `${type}:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ type, name, isDirect: directSet.has(key) });
    // Recurse: anything that lists `name` as a child is a deeper descendant.
    (reverse.get(name) || []).forEach(p => visit(p.name, p.type));
    dashMembers
      .filter(m => m.member === name)
      .forEach(m => visit(m.dashboard, 'dashboard'));
  };

  directParents.forEach(p => visit(p.name, p.type));
  directDashboards.forEach(d => visit(d.name, d.type));
  return out;
}

function buildLineageRelations(subject, storeApi) {
  return {
    ancestors: buildAncestors(subject, storeApi),
    descendants: buildDescendants(subject, storeApi),
  };
}

// Backward-compat: VIS-780 will replace this with `<MiniLineageCard>`.
function buildChainFromStore(subject, storeApi) {
  return buildAncestors(subject, storeApi);
}

// ---------------------------------------------------------------------------
// Row primitives
// ---------------------------------------------------------------------------

const TypePill = ({ type, tone, alignRight }) => (
  <span
    className={[
      'inline-flex h-3 shrink-0 items-center rounded-sm px-1 text-[8px] font-bold uppercase tracking-wider',
      tone.pillBg,
      tone.pillFg,
    ].join(' ')}
    style={alignRight ? { marginLeft: 'auto' } : undefined}
  >
    {type}
  </span>
);

const IconTile = ({ Icon, tone }) => (
  <span
    className={[
      'relative z-10 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded',
      tone.iconBg,
      tone.iconFg,
    ].join(' ')}
  >
    <Icon style={{ fontSize: 10 }} />
  </span>
);

const NameLabel = ({ name, align = 'left' }) => (
  <span
    className={[
      'min-w-0 truncate text-[11.5px] font-medium text-gray-800',
      align === 'center' ? 'flex-1 text-center' : 'flex-1',
    ].join(' ')}
  >
    {name}
  </span>
);

const AncestorRow = ({ node, leftPad, dottedHeight, testIdPrefix }) => {
  const tone = getTone(node.type);
  const Icon = getIcon(node.type);
  return (
    <li
      data-testid={`${testIdPrefix}-lineage-${node.type}-${node.name}`}
      data-direction="ancestor"
      data-direct={node.isDirect ? 'true' : 'false'}
      className="relative flex items-center gap-1.5 self-stretch"
      style={{
        height: ROW_HEIGHT,
        paddingLeft: leftPad,
        paddingRight: 4,
      }}
    >
      {/* Dotted connector: drops from the left of the [type] pill down
          past every row beneath it to the top of the subject's icon. */}
      {node.isDirect && dottedHeight > 0 && (
        <span
          aria-hidden="true"
          data-testid={`${testIdPrefix}-dotted-${node.name}`}
          className="absolute"
          style={{
            left: leftPad - 5,
            top: ROW_HEIGHT / 2,
            height: dottedHeight,
            width: 2,
            // Repeating gradient gives a crisp, visible dotted line at
            // small widths where CSS `border-style: dotted` renders as
            // a near-invisible hairline.
            backgroundImage:
              'repeating-linear-gradient(to bottom, #6b7280 0, #6b7280 2px, transparent 2px, transparent 5px)',
          }}
        />
      )}
      <TypePill type={node.type} tone={tone} />
      <NameLabel name={node.name} />
      <IconTile Icon={Icon} tone={tone} />
    </li>
  );
};

const DescendantRow = ({ node, leftPad, testIdPrefix }) => {
  const tone = getTone(node.type);
  const Icon = getIcon(node.type);
  return (
    <li
      data-testid={`${testIdPrefix}-lineage-${node.type}-${node.name}`}
      data-direction="descendant"
      data-direct={node.isDirect ? 'true' : 'false'}
      className="relative flex items-center gap-1.5 self-stretch"
      style={{
        height: ROW_HEIGHT,
        paddingLeft: leftPad,
        paddingRight: 4,
      }}
    >
      <IconTile Icon={Icon} tone={tone} />
      <NameLabel name={node.name} />
      <TypePill type={node.type} tone={tone} alignRight />
    </li>
  );
};

const SubjectRow = ({ subject, testIdPrefix }) => {
  const tone = getTone(subject.type);
  const Icon = getIcon(subject.type);
  return (
    <li
      data-testid={`${testIdPrefix}-lineage-subject`}
      data-direction="subject"
      className="relative flex items-center self-stretch rounded-md ring-1 ring-[#713b57]/40 bg-[#e2d7dd]/40"
      style={{ height: ROW_HEIGHT + 4, paddingLeft: 6, paddingRight: 6 }}
    >
      <IconTile Icon={Icon} tone={tone} />
      <span className="flex-1 text-center text-[11.5px] font-semibold text-gray-900 truncate min-w-0 px-2">
        {subject.name}
      </span>
      <TypePill type={subject.type} tone={tone} />
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
  const csvScriptModels = useStore(s => s.csvScriptModels);
  const localMergeModels = useStore(s => s.localMergeModels);

  const lineage = useMemo(() => {
    return buildLineageRelations(obj, {
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
      allDashboards,
      csvScriptModels,
      localMergeModels,
    });
  }, [
    obj,
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
    allDashboards,
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

  const selectorRendered = obj.name
    ? `+${String(obj.name).toLowerCase().replace(/[^a-z0-9_]+/g, '_')}`
    : '+';

  const ancestors = lineage.ancestors;
  const descendants = lineage.descendants;
  const N = ancestors.length;
  const isEmpty = N === 0 && descendants.length === 0;

  // Compute each ancestor row's left padding so that:
  //   - the bottom-most ancestor (index N-1) sits at BASE_INDENT
  //   - each row above shifts left by STEP (i.e. its padding grows)
  // That mirrors the descendant ladder, which starts at BASE_INDENT and
  // grows by STEP per row downward.
  const ancestorLeftPad = i => BASE_INDENT + (N - 1 - i) * STEP;
  const descendantLeftPad = j => BASE_INDENT + j * STEP;

  // Dotted line drops from the [type] pill of a direct ancestor down to
  // the top of the subject row. Each row contributes ROW_HEIGHT + ROW_GAP
  // of vertical distance; the line should reach the top of the subject
  // row (which sits just below the last ancestor row).
  const dottedHeightFor = i => {
    const rowsBetween = N - i; // includes this row + every row below + the gap to subject
    return rowsBetween * (ROW_HEIGHT + ROW_GAP) - ROW_HEIGHT / 2;
  };

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
            const I = getIcon(obj.type);
            return <I style={{ fontSize: 14 }} className="text-gray-500" />;
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
            className="flex h-7 items-center gap-1.5 rounded-md bg-gray-50 px-2 ring-1 ring-gray-200"
            data-testid={`${testIdPrefix}-selector`}
          >
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              sel
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-gray-800">
              {selectorRendered}
            </span>
          </div>
        </div>

        <div
          className="flex-1 min-h-0 overflow-y-auto px-3 py-2"
          style={{ maxHeight: 260 }}
          data-testid={`${testIdPrefix}-body`}
        >
          {isEmpty ? (
            <p
              className="px-1 text-[11px] italic text-gray-500"
              data-testid={`${testIdPrefix}-empty`}
            >
              No lineage available for this object.
            </p>
          ) : (
            <ul
              className="flex flex-col"
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
                            leftPad={ancestorLeftPad(i)}
                            dottedHeight={node.isDirect ? dottedHeightFor(i) : 0}
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

              {descendants.length > 0 && (
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
                            leftPad={descendantLeftPad(j)}
                            testIdPrefix={testIdPrefix}
                          />
                        ))}
                      </ul>
                    ) : (
                      <span
                        className="inline-flex h-4 items-center rounded bg-gray-100 px-1.5 text-[9.5px] font-medium uppercase tracking-wider text-gray-500"
                        style={{ marginLeft: BASE_INDENT }}
                      >
                        +{descendants.length} downstream
                      </span>
                    )}
                  </button>
                </li>
              )}
            </ul>
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
  getIcon,
  getTone,
  ROW_HEIGHT,
  ROW_GAP,
  STEP,
  BASE_INDENT,
};
export default LibraryRowFlipPopover;
