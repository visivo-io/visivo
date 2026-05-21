import React, { useEffect, useMemo, useRef } from 'react';
import { PiX, PiArrowSquareOut } from 'react-icons/pi';
import useStore from '../../../../stores/store';
import { getTypeIcon } from '../../common/objectTypeConfigs';

/**
 * LibraryRowFlipPopover — VIS-776 / Track C C3.
 *
 * Anchored popover that flips out from a Library row to show the row's
 * lineage neighbourhood. Per the design, the popover frame chrome
 * (anchor arrow, header, footer) belongs to Track C; the inner lineage
 * card is shared with the canvas item flip surface (D-5) and will be
 * extracted as `<MiniLineageCard>` once VIS-D6 (full lineage modal)
 * stabilises the data shape. For C3 we render an inline mini-chain
 * placeholder driven by the existing store (no new API calls).
 *
 * Geometry: ~280 × 260, anchored to the right of the row with an
 * anchor-arrow at the left edge. Closes on outside click, Escape, or
 * the × button. The popover anchor is the parent `<LibraryRow>`;
 * position is `absolute top-0 left-full` so siblings don't reflow.
 *
 * NOTE: For C3 the lineage chain is computed locally from the store
 * (chart → first insight → first model → first source). Real upstream
 * traversal lands with the shared MiniLineageCard in VIS-780 (C4).
 */
const TYPE_TONE = {
  chart: { iconBg: 'bg-[#e2d7dd]/70', iconFg: 'text-[#713b57]', pillBg: 'bg-[#e2d7dd]', pillFg: 'text-[#5a2f45]' },
  insight: { iconBg: 'bg-[#d4e1e2]/70', iconFg: 'text-[#1b4042]', pillBg: 'bg-[#d4e1e2]', pillFg: 'text-[#1b4042]' },
  model: { iconBg: 'bg-[#d4e1e2]/70', iconFg: 'text-[#1b4042]', pillBg: 'bg-[#d4e1e2]', pillFg: 'text-[#1b4042]' },
  source: { iconBg: 'bg-[#d4e1e2]/70', iconFg: 'text-[#1b4042]', pillBg: 'bg-[#d4e1e2]', pillFg: 'text-[#1b4042]' },
  table: { iconBg: 'bg-[#e2d7dd]/70', iconFg: 'text-[#713b57]', pillBg: 'bg-[#e2d7dd]', pillFg: 'text-[#5a2f45]' },
  markdown: { iconBg: 'bg-[#e2d7dd]/70', iconFg: 'text-[#713b57]', pillBg: 'bg-[#e2d7dd]', pillFg: 'text-[#5a2f45]' },
  input: { iconBg: 'bg-[#e2d7dd]/70', iconFg: 'text-[#713b57]', pillBg: 'bg-[#e2d7dd]', pillFg: 'text-[#5a2f45]' },
  dashboard: { iconBg: 'bg-[#e6edf8]/70', iconFg: 'text-[#1e3a5f]', pillBg: 'bg-[#e6edf8]', pillFg: 'text-[#1e3a5f]' },
  insert: { iconBg: 'bg-gray-100', iconFg: 'text-gray-600', pillBg: 'bg-gray-100', pillFg: 'text-gray-700' },
};

const getTone = (type) => TYPE_TONE[type] || TYPE_TONE.model;
// Object-type icons come from the app-wide canonical `objectTypeConfigs.js`
// (MUI icons); `getTypeIcon` falls back to a sensible default for unknowns.
const getIcon = (type) => getTypeIcon(type);

/**
 * LineageRow — single node row inside the popover. Mirrors the row layout
 * shipped by `mini-lineage-card.jsx` (icon tile + type pill + name).
 */
const LineageRow = ({ node, isSubject }) => {
  const tone = getTone(node.type);
  const I = getIcon(node.type);
  return (
    <li
      data-testid={`library-flip-popover-lineage-${node.type}-${node.name}`}
      className={[
        'group flex w-full items-center gap-1.5 rounded-md py-0.5 pr-1.5 pl-0 text-left',
        isSubject ? 'ring-1 ring-[#713b57]/30 bg-[#e2d7dd]/30' : '',
      ].join(' ')}
    >
      <span
        className={`relative z-10 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded ${tone.iconBg} ${tone.iconFg}`}
      >
        <I style={{ fontSize: 10 }} />
      </span>
      <span
        className={`inline-flex h-3 shrink-0 items-center rounded-sm px-1 text-[8px] font-bold uppercase tracking-wider ${tone.pillBg} ${tone.pillFg}`}
      >
        {node.type}
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-[11.5px] ${
          isSubject ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'
        }`}
      >
        {node.name}
      </span>
      {isSubject && (
        <span className="shrink-0 inline-flex h-3 items-center rounded-sm bg-[#713b57] px-1 text-[8px] font-bold uppercase tracking-wider text-white">
          this
        </span>
      )}
    </li>
  );
};

/**
 * Build a small ancestor chain for the given subject by walking the simplest
 * relationships exposed in the existing store. This is intentionally a
 * subset of what the full lineage modal (D-6) will surface — it covers the
 * common cases (chart → insight → model → source) so the popover is useful
 * even before VIS-780 wires the shared `<MiniLineageCard>`.
 */
function findByName(list, name) {
  if (!Array.isArray(list) || !name) return null;
  return list.find((o) => o && o.name === name) || null;
}

function buildChainFromStore(subject, storeApi) {
  if (!subject) return [];
  const chain = [];
  const seen = new Set([`${subject.type}:${subject.name}`]);

  if (subject.type === 'chart') {
    const chart = storeApi.getChartByName?.(subject.name);
    const insightRef = pickInsightRef(chart);
    if (insightRef) {
      const insight = storeApi.getInsightByName?.(insightRef);
      if (insight && !seen.has(`insight:${insight.name}`)) {
        chain.push({ type: 'insight', name: insight.name });
        seen.add(`insight:${insight.name}`);
        appendModelAndSource(insight, storeApi, chain, seen);
      }
    }
  } else if (subject.type === 'insight') {
    const insight = storeApi.getInsightByName?.(subject.name);
    if (insight) appendModelAndSource(insight, storeApi, chain, seen);
  } else if (subject.type === 'model') {
    const model =
      storeApi.getModelByName?.(subject.name) ||
      findByName(storeApi.csvScriptModels, subject.name) ||
      findByName(storeApi.localMergeModels, subject.name);
    if (model) appendSource(model, storeApi, chain, seen);
  } else if (subject.type === 'source') {
    // Sources have no upstream; the chain is just the subject row.
  } else if (subject.type === 'insert') {
    // Layout primitives have no lineage.
  }

  return chain;
}

function pickInsightRef(chart) {
  if (!chart) return null;
  // Charts reference one or more insights via `insights: [{ ref|name }]`.
  // We pick the first reference that looks like a name.
  const list = chart.insights || chart.config?.insights || [];
  if (!Array.isArray(list) || list.length === 0) return null;
  const first = list[0];
  if (typeof first === 'string') return first;
  return first?.name || first?.ref || null;
}

function appendModelAndSource(insight, storeApi, chain, seen) {
  const modelRef = insight?.model || insight?.config?.model;
  if (modelRef && !seen.has(`model:${modelRef}`)) {
    const model =
      storeApi.getModelByName?.(modelRef) ||
      findByName(storeApi.csvScriptModels, modelRef) ||
      findByName(storeApi.localMergeModels, modelRef);
    chain.push({ type: 'model', name: modelRef });
    seen.add(`model:${modelRef}`);
    if (model) appendSource(model, storeApi, chain, seen);
  }
}

function appendSource(model, storeApi, chain, seen) {
  const sourceRef = model?.source || model?.config?.source;
  if (sourceRef && !seen.has(`source:${sourceRef}`)) {
    chain.push({ type: 'source', name: sourceRef });
    seen.add(`source:${sourceRef}`);
  }
}

const LibraryRowFlipPopover = ({
  obj,
  anchorTop = 0,
  onClose,
  testIdPrefix = 'library-flip-popover',
}) => {
  const popoverRef = useRef(null);

  // Pull the lineage data from the store. We use refs into the store to
  // avoid re-renders on unrelated changes; the chain is computed once on
  // mount (since the popover is short-lived).
  const getChartByName = useStore((s) => s.getChartByName);
  const getInsightByName = useStore((s) => s.getInsightByName);
  const getModelByName = useStore((s) => s.getModelByName);
  const csvScriptModels = useStore((s) => s.csvScriptModels);
  const localMergeModels = useStore((s) => s.localMergeModels);

  const chain = useMemo(() => {
    return buildChainFromStore(obj, {
      getChartByName,
      getInsightByName,
      getModelByName,
      csvScriptModels,
      localMergeModels,
    });
  }, [obj, getChartByName, getInsightByName, getModelByName, csvScriptModels, localMergeModels]);

  // Close on outside click or Escape.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose && onClose();
      }
    };
    const onDoc = (e) => {
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
  const isEmpty = chain.length === 0 && obj.type !== 'insert';

  return (
    <div
      ref={popoverRef}
      data-testid={testIdPrefix}
      role="dialog"
      aria-label={`Lineage preview for ${obj.name}`}
      className="absolute left-full top-1/2 z-30 ml-3 -translate-y-1/2"
      style={{ width: 280, top: anchorTop || undefined }}
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
          data-testid={`${testIdPrefix}-body`}
        >
          {isEmpty ? (
            <p
              className="px-1 text-[11px] italic text-gray-500"
              data-testid={`${testIdPrefix}-empty`}
            >
              No upstream dependencies for this object.
            </p>
          ) : (
            <ul
              className="flex flex-col gap-0.5"
              data-testid={`${testIdPrefix}-chain`}
            >
              <LineageRow node={{ type: obj.type, name: obj.name }} isSubject />
              {chain.map((node, idx) => (
                <LineageRow key={`${node.type}:${node.name}:${idx}`} node={node} />
              ))}
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
    </div>
  );
};

export { buildChainFromStore, getIcon, getTone };
export default LibraryRowFlipPopover;
