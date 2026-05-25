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

function findByName(list, name) {
  if (!Array.isArray(list) || !name) return null;
  return list.find(o => o && o.name === name) || null;
}

function refValue(ref) {
  if (!ref) return null;
  if (typeof ref === 'string') return ref;
  return ref.name || ref.ref || null;
}

function pickInsightRefs(chart) {
  const list = chart?.insights || chart?.config?.insights || [];
  if (!Array.isArray(list)) return [];
  return list.map(refValue).filter(Boolean);
}

function pickModelRef(insight) {
  return refValue(insight?.model || insight?.config?.model);
}

function pickSourceRef(model) {
  return refValue(model?.source || model?.config?.source);
}

/**
 * Walk a chart's upstream chain. Each direct insight is pushed first,
 * followed by its model and source (deduped). This gives the mock's
 * interleaved ladder (source · model · insight · model · insight · subject).
 */
function pushChartAncestors(chart, storeApi, push, seen) {
  const refs = pickInsightRefs(chart);
  refs.forEach(insightRef => {
    const insight = storeApi.getInsightByName?.(insightRef);
    if (!insight) return;
    pushInsightAncestors(insight, storeApi, push, seen, /* isInsightDirect */ true);
  });
}

function pushInsightAncestors(insight, storeApi, push, seen, isInsightDirect = true) {
  const modelRef = pickModelRef(insight);
  if (modelRef) {
    const model =
      storeApi.getModelByName?.(modelRef) ||
      findByName(storeApi.csvScriptModels, modelRef) ||
      findByName(storeApi.localMergeModels, modelRef);
    if (model) {
      pushModelAncestors(model, storeApi, push, seen, /* isModelDirect */ false);
    } else {
      push({ type: 'model', name: modelRef, isDirect: false }, seen);
    }
  }
  push({ type: 'insight', name: insight.name, isDirect: isInsightDirect }, seen);
}

function pushModelAncestors(model, storeApi, push, seen, isModelDirect = true) {
  const sourceRef = pickSourceRef(model);
  if (sourceRef) {
    push({ type: 'source', name: sourceRef, isDirect: false }, seen);
  }
  push({ type: 'model', name: model.name, isDirect: isModelDirect }, seen);
}

// ---------------------------------------------------------------------------
// Descendant walkers — scan the store for objects that reference the subject.
// ---------------------------------------------------------------------------

function collectDashboardsReferencing(name, dashboards) {
  if (!Array.isArray(dashboards)) return [];
  const hits = [];
  dashboards.forEach(d => {
    if (!d || !Array.isArray(d.rows)) return;
    const matches = d.rows.some(row => {
      if (!row || !Array.isArray(row.items)) return false;
      return row.items.some(item => {
        if (!item) return false;
        const itemRef = refValue(item.chart) || refValue(item.table) || refValue(item.markdown);
        return itemRef === name;
      });
    });
    if (matches) hits.push(d.name);
  });
  return hits;
}

function collectChartsReferencing(insightName, charts) {
  if (!Array.isArray(charts)) return [];
  return charts
    .filter(c => pickInsightRefs(c).includes(insightName))
    .map(c => c.name)
    .filter(Boolean);
}

function collectInsightsReferencing(modelName, insights) {
  if (!Array.isArray(insights)) return [];
  return insights
    .filter(i => pickModelRef(i) === modelName)
    .map(i => i.name)
    .filter(Boolean);
}

function collectModelsReferencing(sourceName, ...modelLists) {
  const hits = [];
  modelLists.forEach(list => {
    if (!Array.isArray(list)) return;
    list.forEach(m => {
      if (m && pickSourceRef(m) === sourceName) hits.push(m.name);
    });
  });
  return hits;
}

function buildAncestors(subject, storeApi) {
  if (!subject) return [];
  const out = [];
  const seen = new Set([`${subject.type}:${subject.name}`]);
  const push = (node, seenSet) => {
    const key = `${node.type}:${node.name}`;
    if (seenSet.has(key)) return;
    seenSet.add(key);
    out.push(node);
  };

  if (subject.type === 'chart' || subject.type === 'table') {
    const obj =
      subject.type === 'chart'
        ? storeApi.getChartByName?.(subject.name)
        : findByName(storeApi.tables, subject.name);
    if (obj) pushChartAncestors(obj, storeApi, push, seen);
  } else if (subject.type === 'insight') {
    const insight = storeApi.getInsightByName?.(subject.name);
    if (insight) {
      // Subject itself is the "direct" node — its parents are model/source.
      const modelRef = pickModelRef(insight);
      if (modelRef) {
        const model =
          storeApi.getModelByName?.(modelRef) ||
          findByName(storeApi.csvScriptModels, modelRef) ||
          findByName(storeApi.localMergeModels, modelRef);
        if (model) pushModelAncestors(model, storeApi, push, seen, true);
        else push({ type: 'model', name: modelRef, isDirect: true }, seen);
      }
    }
  } else if (subject.type === 'model') {
    const model =
      storeApi.getModelByName?.(subject.name) ||
      findByName(storeApi.csvScriptModels, subject.name) ||
      findByName(storeApi.localMergeModels, subject.name);
    if (model) {
      const sourceRef = pickSourceRef(model);
      if (sourceRef) push({ type: 'source', name: sourceRef, isDirect: true }, seen);
    }
  }
  // sources, dashboards, markdowns, inputs, inserts have no upstream.

  return out;
}

function buildDescendants(subject, storeApi) {
  if (!subject) return [];
  const out = [];
  const seen = new Set([`${subject.type}:${subject.name}`]);
  const push = node => {
    const key = `${node.type}:${node.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(node);
  };

  if (subject.type === 'source') {
    const models = collectModelsReferencing(
      subject.name,
      storeApi.models,
      storeApi.csvScriptModels,
      storeApi.localMergeModels
    );
    models.forEach(name => push({ type: 'model', name, isDirect: true }));
  } else if (subject.type === 'model') {
    collectInsightsReferencing(subject.name, storeApi.insights).forEach(name =>
      push({ type: 'insight', name, isDirect: true })
    );
  } else if (subject.type === 'insight') {
    collectChartsReferencing(subject.name, storeApi.charts).forEach(name =>
      push({ type: 'chart', name, isDirect: true })
    );
  } else if (
    subject.type === 'chart' ||
    subject.type === 'table' ||
    subject.type === 'markdown'
  ) {
    collectDashboardsReferencing(subject.name, storeApi.allDashboards).forEach(name =>
      push({ type: 'dashboard', name, isDirect: true })
    );
  }
  // dashboards / inserts / inputs have no downstream we track here.

  return out;
}

function buildLineageRelations(subject, storeApi) {
  return {
    ancestors: buildAncestors(subject, storeApi),
    descendants: buildDescendants(subject, storeApi),
  };
}

// Backward-compat: VIS-780 will replace this with `<MiniLineageCard>`.
// The legacy chain (subject's upstream-only chain, deepest-first → direct)
// is still useful in places that imported it from this module.
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
          className="absolute border-l border-dotted border-gray-400"
          style={{
            left: leftPad - 4,
            top: ROW_HEIGHT / 2,
            height: dottedHeight,
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

  const getChartByName = useStore(s => s.getChartByName);
  const getInsightByName = useStore(s => s.getInsightByName);
  const getModelByName = useStore(s => s.getModelByName);
  const charts = useStore(s => s.charts);
  const insights = useStore(s => s.insights);
  const models = useStore(s => s.models);
  const tables = useStore(s => s.tables);
  const allDashboards = useStore(s => s.allDashboards);
  const csvScriptModels = useStore(s => s.csvScriptModels);
  const localMergeModels = useStore(s => s.localMergeModels);

  const relations = useMemo(() => {
    return buildLineageRelations(obj, {
      getChartByName,
      getInsightByName,
      getModelByName,
      charts,
      insights,
      models,
      tables,
      allDashboards,
      csvScriptModels,
      localMergeModels,
    });
  }, [
    obj,
    getChartByName,
    getInsightByName,
    getModelByName,
    charts,
    insights,
    models,
    tables,
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

  const ancestors = relations.ancestors;
  const descendants = relations.descendants;
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
