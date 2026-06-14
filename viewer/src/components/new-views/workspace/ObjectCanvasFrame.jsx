import React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  PiSquaresFour,
  PiTreeStructure,
  PiPencilSimple,
  PiTable,
  PiGraph,
  PiLockSimple,
  PiCircleDuotone,
} from 'react-icons/pi';
import useStore from '../../../stores/store';
import { isAvailable } from '../../../contexts/URLContext';
import { getTypeColors, getTypeIcon, getTypeByValue } from '../common/objectTypeConfigs';
import SubBar from './SubBar';
import Segmented from './Segmented';
import LineageCanvas from '../lineage/LineageCanvas';
import { getCanvasDescriptor } from './objectCanvasRegistry';
import { useCanvasRecord } from './useCanvasRecord';

/**
 * ObjectCanvasFrame — the shared shell for every per-object Workspace canvas
 * (VIS-1001). It absorbs the chrome each preview used to re-implement:
 *
 *   - the SubBar (tinted type icon + `name · singularLabel`) and the N-way lens
 *     picker driven by the type's descriptor (`descriptor.lenses` + universal
 *     `lineage`);
 *   - a lens-aware affordance — a read-only lock pill on read-only lenses,
 *     replaced by a dirty indicator on editable lenses (the seam VIS-1008/1009/
 *     1010 + the markdown editor plug into via ObjectCanvasDirtyContext);
 *   - the four canonical states — `unavailable` (dist/cloud for a `serve` type),
 *     `not-found`, `empty`, `loading` — with the body mounted ONLY when ready,
 *     inside <Suspense> so the lazy (code-split) body shows the frame's loading
 *     state while its chunk fetches.
 *
 * The per-object lens is LOCAL state here (never the shared dashboard
 * `workspaceLens`), re-defaulting on `type:name` change so it can't leak across
 * objects, and honouring the `?lens=` deep link + `workspaceLensIntent`.
 */

// Editable canvas bodies report draft dirtiness up to the frame through this
// context so the frame can swap the read-only pill for a dirty indicator.
export const ObjectCanvasDirtyContext = React.createContext({ dirty: false, setDirty: () => {} });
export const useObjectCanvasDirty = () => React.useContext(ObjectCanvasDirtyContext);

const LENS_ICON = {
  preview: PiSquaresFour,
  lineage: PiTreeStructure,
  edit: PiPencilSimple,
  build: PiTable,
  erd: PiGraph,
  schema: PiTreeStructure,
  field: PiPencilSimple,
};

const LINEAGE_LENS = { key: 'lineage', label: 'Lineage', kind: 'readonly' };

// isAvailable throws if no global URL config is set (e.g. a bare unit test);
// treat that as "available" so canvases render outside the dist guard.
const safeAvailable = key => {
  try {
    return isAvailable(key);
  } catch {
    return true;
  }
};

const FrameState = ({ testId, title, body, icon: Icon = PiCircleDuotone }) => (
  <div
    data-testid={testId}
    className="flex flex-1 items-center justify-center bg-gray-50 p-12"
  >
    <div className="max-w-[420px] rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <Icon className="mx-auto mb-2 h-6 w-6 text-gray-300" aria-hidden="true" />
      <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
      {body && (
        <p className="mx-auto mt-1.5 max-w-[320px] text-[13px] leading-relaxed text-gray-500">
          {body}
        </p>
      )}
    </div>
  </div>
);

const ObjectCanvasFrame = ({ activeObject, projectId }) => {
  const name = activeObject?.name || '(unnamed)';
  const type = activeObject?.type || 'object';
  const objectKey = `${type}:${name}`;

  const descriptor = getCanvasDescriptor(type);
  const colors = getTypeColors(type);
  const Icon = getTypeIcon(type);
  const singularLabel = getTypeByValue(type)?.singularLabel || type;

  // The ordered lens list: the descriptor's lenses + the universal Lineage lens.
  // A type with no descriptor exposes only Lineage (Canvas shows muted).
  const lenses = React.useMemo(
    () => [...(descriptor?.lenses || []), LINEAGE_LENS],
    [descriptor]
  );
  const validKeys = React.useMemo(() => lenses.map(l => l.key), [lenses]);
  const defaultLens = descriptor?.defaultLens || 'lineage';

  // A deep link (`?edit=<type>:<name>&lens=lineage`) requests Lineage for THIS
  // object; honour it as the initial lens, scoped so it can't leak to the next
  // selection.
  const [searchParams] = useSearchParams();
  const deepLinkLens = React.useMemo(() => {
    if (searchParams.get('lens') !== 'lineage') return null;
    return searchParams.get('edit') === objectKey ? 'lineage' : null;
  }, [searchParams, objectKey]);

  // A lineage node click requests Lineage for the object it selects (one-shot).
  const lensIntent = useStore(s => s.workspaceLensIntent);
  const clearWorkspaceLensIntent = useStore(s => s.clearWorkspaceLensIntent);
  const intentLens =
    lensIntent && lensIntent.objectKey === objectKey ? lensIntent.lens : null;
  const requestedLens = deepLinkLens || intentLens;

  const [lensEffective, setLensEffective] = React.useState(requestedLens || defaultLens);

  // Re-default the lens whenever the active object changes — React reuses this
  // instance across sibling selections, so without this the previous object's
  // lens would leak.
  const prevKeyRef = React.useRef(objectKey);
  React.useEffect(() => {
    if (prevKeyRef.current !== objectKey) {
      prevKeyRef.current = objectKey;
      setLensEffective(requestedLens || defaultLens);
    }
  }, [objectKey, requestedLens, defaultLens]);

  React.useEffect(() => {
    if (intentLens && clearWorkspaceLensIntent) clearWorkspaceLensIntent();
  }, [intentLens, clearWorkspaceLensIntent]);

  // Clamp any stale / invalid lens to the type's default (a fallback type can
  // never show a canvas lens — it clamps to lineage).
  const lens = validKeys.includes(lensEffective) ? lensEffective : defaultLens;
  const activeLensMeta = lenses.find(l => l.key === lens) || LINEAGE_LENS;

  // Editable-lens dirty seam (no body uses it yet in VIS-1001).
  const [dirty, setDirty] = React.useState(false);
  const dirtyCtx = React.useMemo(() => ({ dirty, setDirty }), [dirty]);
  React.useEffect(() => setDirty(false), [objectKey, lens]); // reset on object/lens change

  const hasCanvasLens = Boolean(descriptor);

  // The N-way lens picker (Segmented). For a no-descriptor type, the only real
  // lens is Lineage; show a muted disabled "Canvas" so the affordance is legible.
  const options = React.useMemo(() => {
    if (!hasCanvasLens) {
      return [
        {
          value: 'preview',
          label: 'Canvas',
          icon: PiSquaresFour,
          disabled: true,
          title: 'No canvas available yet — showing lineage',
        },
        { value: 'lineage', label: 'Lineage', icon: PiTreeStructure },
      ];
    }
    return lenses.map(l => ({ value: l.key, label: l.label, icon: LENS_ICON[l.key] }));
  }, [hasCanvasLens, lenses]);

  // The read-only / dirty affordance describes the OBJECT's canvas lens; the
  // universal Lineage lens is its own read-only DAG and carries no pill.
  const showAffordance = lens !== 'lineage';
  const lensPicker = (
    <div className="flex items-center gap-2">
      {showAffordance &&
        (activeLensMeta.kind === 'editable' ? (
        <span
          data-testid="canvas-dirty-indicator"
          data-dirty={dirty ? 'true' : 'false'}
          title={dirty ? 'Unsaved changes' : 'No unsaved changes'}
          className={[
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
            dirty ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-400',
          ].join(' ')}
        >
          <PiCircleDuotone className="h-3 w-3" aria-hidden="true" />
          {dirty ? 'Unsaved' : 'Saved'}
        </span>
      ) : (
        <span
          data-testid="canvas-readonly-pill"
          title="Read-only — edit in the right rail"
          className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-400"
        >
          <PiLockSimple className="h-3 w-3" aria-hidden="true" />
          Read-only
        </span>
        ))}
      <Segmented
        ariaLabel="View"
        tone="light"
        value={lens}
        onChange={setLensEffective}
        testId="workspace-lens-picker"
        options={options}
      />
    </div>
  );

  return (
    <section
      data-testid={`workspace-middle-${type}`}
      className="flex h-full w-full flex-col bg-gray-50"
    >
      <SubBar
        testId={`workspace-subbar-${type}`}
        left={
          <div className="flex items-center gap-2 text-[12px]">
            {Icon && <Icon className={`h-4 w-4 shrink-0 ${colors.text}`} aria-hidden="true" />}
            <span className="truncate font-semibold text-gray-900">{name}</span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-500">{singularLabel}</span>
          </div>
        }
        right={lensPicker}
      />
      <ObjectCanvasDirtyContext.Provider value={dirtyCtx}>
        {lens === 'lineage' ? (
          <div
            data-testid={`workspace-middle-${type}-lineage`}
            className="flex flex-1 min-h-0"
          >
            <LineageCanvas />
          </div>
        ) : (
          <CanvasBody
            type={type}
            descriptor={descriptor}
            activeObject={activeObject}
            projectId={projectId}
          />
        )}
      </ObjectCanvasDirtyContext.Provider>
    </section>
  );
};

/**
 * CanvasBody — the canvas-lens region. Mounts the lazy body inside <Suspense>
 * (the frame's loading state shows during chunk fetch), gated by availability.
 *
 * The body resolves + renders its own record (and its own empty / not-found
 * state, as each preview already does); the frame just RESOLVES the record via
 * `useCanvasRecord` and passes it down so csvScriptModel / localMergeModel —
 * whose records live in their own collections, not `models` — render the Model
 * canvas instead of "not found". Centralising the empty states in the frame is
 * a follow-up; VIS-1001 keeps the bodies' states to avoid visual regression.
 */
const CanvasBody = ({ type, descriptor, activeObject, projectId }) => {
  const { config } = useCanvasRecord(type, activeObject?.name || null);
  const Body = descriptor.Component;
  const unavailable =
    descriptor.availability === 'serve' && !safeAvailable(descriptor.availabilityKey);

  return (
    <div data-testid={`workspace-middle-${type}-preview`} className="flex flex-1 min-h-0 min-w-0">
      {unavailable ? (
        <FrameState
          testId="canvas-unavailable"
          icon={PiLockSimple}
          title="Available with visivo serve"
          body="Run `visivo serve` locally to use this canvas. The hosted build can still browse lineage."
        />
      ) : (
        <React.Suspense
          fallback={<FrameState testId="canvas-loading" title="Loading canvas…" />}
        >
          <Body activeObject={activeObject} projectId={projectId} record={config} />
        </React.Suspense>
      )}
    </div>
  );
};

export default ObjectCanvasFrame;
