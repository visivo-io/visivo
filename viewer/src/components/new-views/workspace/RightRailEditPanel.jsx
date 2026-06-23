import React, { useCallback, useMemo, useState } from 'react';
import { PiPencil, PiPlus } from 'react-icons/pi';
import useStore from '../../../stores/store';
import useWorkspaceScope from './useWorkspaceScope';
import useDebouncedSave from './useDebouncedSave';
import SelectionChip from './SelectionChip';
import EditPanelBreadcrumb from './EditPanelBreadcrumb';
import { applyReorder } from './breadcrumbNav';
import RowEditForm from '../common/RowEditForm';
import ItemEditForm, { getItemLeafRef } from '../common/ItemEditForm';
import MarkdownEditForm from '../common/MarkdownEditForm';
import InputEditForm from '../common/InputEditForm';
import ChartEditForm from '../common/ChartEditForm';
import TableEditForm from '../common/TableEditForm';
import SourceEditForm from '../common/SourceEditForm';
import InsightEditForm from '../common/InsightEditForm';
import ModelEditForm from '../common/ModelEditForm';
import DimensionEditForm from '../common/DimensionEditForm';
import MetricEditForm from '../common/MetricEditForm';
import RelationEditForm from '../common/RelationEditForm';
import LevelEditForm from '../common/LevelEditForm';
import DefaultsEditForm from '../common/DefaultsEditForm';
import { getTypeByValue } from '../common/objectTypeConfigs';
import { COLLECTION_KEY } from './collectionKeys';
import { formatRef } from '../../../utils/refString';
import useRecordSave from '../../../hooks/useRecordSave';
import sanitizeDashboardConfig from './sanitizeDashboardConfig';
import { emitWorkspaceEvent } from './telemetry';

/**
 * RightRailEditPanel — VIS-802 / Track G G-1.
 *
 * The selection-driven Edit tab of the right rail. Routes the form to render
 * per Q25 from the current selection — read from BOTH the workspace active
 * object (`workspaceActiveObject`) and the Outline-tree selection
 * (`workspaceOutlineSelectedKey`):
 *
 *   - Library-row object (chart/table/markdown/input/source/model/…)  → that
 *     type's existing edit form.
 *   - Scoped dashboard + Outline `dashboard` key  → bundled dashboard-chrome
 *     form (rows list, auto-saved).
 *   - Scoped dashboard + Outline `row.N` key       → <RowEditForm>.
 *   - Scoped dashboard + Outline `row.N.item.M`    → the item's leaf form
 *     (Chart/Table/Markdown/Input) when it references one, else <ItemEditForm>.
 *   - Level (Outline / Project-Editor `level` selection) → <LevelEditForm>
 *     (VIS-807 / M-2b — title + description, persisted via `updateLevel`).
 *   - Project-chrome / defaults selection            → <DefaultsEditForm>
 *     (VIS-809 / M-3 — source_name, threads, levels, persisted via
 *     `saveDefaults`).
 *
 * Every form is fronted by a <SelectionChip> header (rainbow type colour +
 * name) and an inline auto-save indicator. There are NO Save buttons for the
 * dashboard-structure forms — edits flow through `saveDashboard` with a ~500ms
 * debounce (see useDebouncedSave). The reused leaf/Library-row forms keep their
 * own save affordances (out of scope to rebuild).
 *
 * SELECTION SOURCE: Outline-tree + Library selection only. The canvas
 * round-trip (a canvas node updating `workspaceOutlineSelectedKey`) needs D-2
 * which is NOT in this base and is DEFERRED.
 */

// Object types that are edited by reusing their existing leaf/Library-row form.
const LEAF_TYPES = ['chart', 'table', 'markdown', 'input'];
// The richer Data-Layer / leaf forms that bring their own UI (and Save button).
// Routed for completeness; the four leaf types above already cover the
// dashboard-item drill-in.
const LIBRARY_EDITABLE_TYPES = [
  'chart',
  'table',
  'markdown',
  'input',
  'source',
  'model',
  'csvScriptModel',
  'localMergeModel',
  'dimension',
  'metric',
  'relation',
  'insight',
  'dashboard',
];

const emptyLeafFields = () => ({ chart: '', table: '', markdown: '', selector: '', input: '' });

/** Parse `'row.N'` / `'row.N.item.M'` → `{ rowIndex, itemIndex }` (null when n/a). */
const parseOutlineKey = key => {
  if (!key || typeof key !== 'string') return { kind: 'dashboard' };
  if (key === 'dashboard') return { kind: 'dashboard' };
  const itemMatch = key.match(/^row\.(\d+)\.item\.(\d+)$/);
  if (itemMatch) {
    return { kind: 'item', rowIndex: Number(itemMatch[1]), itemIndex: Number(itemMatch[2]) };
  }
  const rowMatch = key.match(/^row\.(\d+)$/);
  if (rowMatch) return { kind: 'row', rowIndex: Number(rowMatch[1]) };
  return { kind: 'dashboard' };
};

const Placeholder = ({ title, body, testId }) => (
  <div
    data-testid={testId}
    className="flex flex-1 items-start justify-center px-6 py-8 text-center"
  >
    <div className="text-gray-500">
      <PiPencil aria-hidden="true" className="mx-auto mb-2 h-5 w-5 text-gray-400" />
      <p className="text-[13px] font-medium text-gray-900">{title}</p>
      {body && <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{body}</p>}
    </div>
  </div>
);

const EmptyState = () => (
  <div
    data-testid="right-rail-edit-empty"
    className="flex flex-1 items-start justify-center px-6 py-8 text-center"
  >
    <div className="text-gray-500">
      <PiPencil aria-hidden="true" className="mx-auto mb-2 h-5 w-5 text-gray-400" />
      <p className="text-[13px] leading-relaxed">
        Select an object from the Library or Outline to edit it here.
      </p>
    </div>
  </div>
);

/**
 * Find the live object record (with `.config`) for an active Library-row object.
 * Each per-type store keeps its collection on a pluralised key.
 */
// COLLECTION_KEY is the shared type→store-collection map (collectionKeys.js),
// also consumed by useCanvasRecord so the right rail and the canvases can never
// drift on which store collection a type's records live in.

const RightRailEditPanel = () => {
  const activeObject = useStore(s => s.workspaceActiveObject);
  const outlineKey = useStore(s => s.workspaceOutlineSelectedKey);
  const setOutlineKey = useStore(s => s.setWorkspaceOutlineSelectedKey);
  const dashboards = useStore(s => s.dashboards);
  const saveDashboard = useStore(s => s.saveDashboard);
  const updateDashboardConfigOptimistic = useStore(s => s.updateDashboardConfigOptimistic);
  const openWorkspaceTab = useStore(s => s.openWorkspaceTab);
  const { dashboardName } = useWorkspaceScope();

  const type = activeObject?.type || null;
  const isDashboardScoped = type === 'dashboard' && !!dashboardName;

  // The scoped dashboard's draft config (rows etc.) — same source the canvas
  // and OutlineTreePanel read, so edits flow live.
  const dashboardEntry = useMemo(() => {
    if (!isDashboardScoped) return null;
    return (dashboards || []).find(d => d.name === dashboardName) || null;
  }, [dashboards, dashboardName, isDashboardScoped]);

  const dashboardConfig = dashboardEntry
    ? dashboardEntry.config || dashboardEntry
    : null;
  const rows = useMemo(
    () => (Array.isArray(dashboardConfig?.rows) ? dashboardConfig.rows : []),
    [dashboardConfig]
  );

  // Debounced auto-save bound to the scoped dashboard. The payload is the full
  // next config; saveDashboard(name, config) round-trips through the draft cache.
  const dashSaveFn = useCallback(
    nextConfig => {
      if (!dashboardName || typeof saveDashboard !== 'function') return undefined;
      return saveDashboard(dashboardName, nextConfig);
    },
    [dashboardName, saveDashboard]
  );
  const { status: saveStatus, scheduleSave } = useDebouncedSave(dashSaveFn, {
    delay: 500,
  });

  /**
   * Commit a next-config: optimistically update the store (so the form, the
   * Outline tree, and the canvas reflect the edit immediately — independent of
   * the backend round-trip), schedule the debounced save, and emit telemetry.
   */
  const persistConfig = useCallback(
    (nextConfig, meta) => {
      // GAP-3: never optimistic-update OR POST an invalid intermediate scaffold.
      // The forms scaffold items with empty-string leaf fields (+ a spurious
      // `selector`), which the backend Item validator rejects with a 400.
      // Normalising here keeps the store, canvas, Outline, AND the persisted
      // YAML always backend-valid — the empty slot stays an empty slot until a
      // real ref is dropped in.
      const cleanConfig = sanitizeDashboardConfig(nextConfig);
      if (updateDashboardConfigOptimistic) {
        updateDashboardConfigOptimistic(dashboardName, cleanConfig);
      }
      scheduleSave(cleanConfig);
      emitWorkspaceEvent('right_rail_autosave_scheduled', {
        object: 'dashboard',
        name: dashboardName,
        ...meta,
      });
    },
    [updateDashboardConfigOptimistic, scheduleSave, dashboardName]
  );

  const writeRows = useCallback(
    (nextRows, meta) => {
      const nextConfig = { ...(dashboardConfig || {}), rows: nextRows };
      persistConfig(nextConfig, meta);
    },
    [dashboardConfig, persistConfig]
  );

  const handleSelectRef = useCallback(
    ref => {
      if (ref && ref.type && ref.name && openWorkspaceTab) {
        openWorkspaceTab({ type: ref.type, name: ref.name });
      }
    },
    [openWorkspaceTab]
  );

  // ⌘↑/⌘↓ reorder from the breadcrumb: swap the node within its siblings in the
  // live config (optimistic + debounced save) and re-key the selection so the
  // breadcrumb + Edit form follow the node to its new index.
  const handleBreadcrumbReorder = useCallback(
    op => {
      if (!op || !dashboardConfig) return;
      const nextConfig = applyReorder(dashboardConfig, op);
      persistConfig(nextConfig, { kind: 'reorder', axis: op.axis });
      const nextKey = op.parentKey === 'dashboard'
        ? `${op.axis}.${op.toIndex}`
        : `${op.parentKey}.${op.axis}.${op.toIndex}`;
      if (setOutlineKey) setOutlineKey(nextKey);
    },
    [dashboardConfig, persistConfig, setOutlineKey]
  );

  // Enter on the breadcrumb focuses the Edit form's first focusable field.
  const handleFocusForm = useCallback(() => {
    if (typeof document === 'undefined') return;
    const panel = document.querySelector('[data-testid="workspace-right-rail-edit"]');
    if (!panel) return;
    const field = panel.querySelector(
      'input:not([type="hidden"]), textarea, select, [contenteditable="true"]'
    );
    if (field && typeof field.focus === 'function') field.focus();
  }, []);

  // The breadcrumb band — rendered at the top of every dashboard-scoped Edit
  // view (dashboard / row / item). Reflects the Outline selection's ancestry
  // and is the keyboard-nav surface (Q7 = C).
  const breadcrumb = (
    <EditPanelBreadcrumb
      outlineKey={outlineKey}
      dashboardName={dashboardName}
      rows={rows}
      onSelectKey={setOutlineKey}
      onReorder={handleBreadcrumbReorder}
      onFocusForm={handleFocusForm}
    />
  );

  // ── Nothing selected ──────────────────────────────────────────────────────
  if (!activeObject) {
    return (
      <div data-testid="workspace-right-rail-edit" className="flex flex-1 flex-col overflow-hidden">
        <EmptyState />
      </div>
    );
  }

  // ── Project-chrome / defaults → DefaultsEditForm (VIS-809 / M-3) ───────────
  if (type === 'project' || type === 'defaults') {
    return (
      <div data-testid="workspace-right-rail-edit" className="flex flex-1 flex-col overflow-hidden">
        <DefaultsEditForm name={activeObject.name} />
      </div>
    );
  }

  // ── Level → LevelEditForm (VIS-807 / M-2b) ─────────────────────────────────
  if (type === 'level') {
    // The selection carries the level's position in `defaults.levels` as
    // `index`; fall back to the first level when it's absent (the form
    // self-resolves the level from the store by index).
    const levelIndex = Number.isInteger(activeObject.index) ? activeObject.index : 0;
    return (
      <div data-testid="workspace-right-rail-edit" className="flex flex-1 flex-col overflow-hidden">
        <LevelEditForm index={levelIndex} />
      </div>
    );
  }

  // ── Scoped dashboard → route by the Outline selection ──────────────────────
  if (isDashboardScoped && dashboardConfig) {
    const sel = parseOutlineKey(outlineKey);

    // dashboard-chrome → bundled rows editor (auto-saved, no Save button).
    if (sel.kind === 'dashboard') {
      const addRow = () =>
        writeRows([...rows, { height: 'medium', items: [] }], { kind: 'add_row' });
      const updateRow = (rowIndex, nextRow) =>
        writeRows(rows.map((r, i) => (i === rowIndex ? nextRow : r)), { kind: 'update_row' });
      const removeRow = rowIndex =>
        writeRows(rows.filter((_, i) => i !== rowIndex), { kind: 'remove_row' });

      return (
        <div data-testid="workspace-right-rail-edit" className="flex flex-1 flex-col overflow-hidden">
          {breadcrumb}
          <SelectionChip
            type="dashboard"
            name={dashboardName}
            subtitle={`${rows.length} row${rows.length === 1 ? '' : 's'}`}
            saveStatus={saveStatus}
          />
          <div
            data-testid="right-rail-edit-dashboard"
            className="flex-1 overflow-y-auto p-3 space-y-3"
          >
            {rows.length === 0 ? (
              <p className="text-xs italic text-gray-500">
                No rows yet. Add a row to start building this dashboard.
              </p>
            ) : (
              rows.map((row, rowIndex) => (
                <RowEditForm
                  key={rowIndex}
                  row={row}
                  rowId={rowIndex}
                  rowIndex={rowIndex}
                  onRemoveRow={() => removeRow(rowIndex)}
                  onHeightChange={height => updateRow(rowIndex, { ...row, height })}
                  onAddItem={() =>
                    updateRow(rowIndex, {
                      ...row,
                      items: [...(row.items || []), { width: 1, ...emptyLeafFields() }],
                    })
                  }
                  onRemoveItem={itemIndex =>
                    updateRow(rowIndex, {
                      ...row,
                      items: (row.items || []).filter((_, i) => i !== itemIndex),
                    })
                  }
                  onItemWidthChange={(itemIndex, width) =>
                    updateRow(rowIndex, {
                      ...row,
                      items: (row.items || []).map((it, i) =>
                        i === itemIndex ? { ...it, width } : it
                      ),
                    })
                  }
                  onItemRefChange={(itemIndex, ref) =>
                    updateRow(rowIndex, {
                      ...row,
                      items: (row.items || []).map((it, i) => {
                        if (i !== itemIndex) return it;
                        const reset = { ...it, ...emptyLeafFields() };
                        if (ref && ref.type && ref.name) reset[ref.type] = formatRef(ref.name);
                        return reset;
                      }),
                    })
                  }
                  onItemChange={(itemIndex, nextItem) =>
                    updateRow(rowIndex, {
                      ...row,
                      items: (row.items || []).map((it, i) => (i === itemIndex ? nextItem : it)),
                    })
                  }
                  onSelectRef={handleSelectRef}
                />
              ))
            )}
            <button
              type="button"
              data-testid="right-rail-edit-add-row"
              onClick={addRow}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-[#713b57] transition-colors hover:bg-[#e2d7dd]/40"
            >
              <PiPlus className="h-3.5 w-3.5" /> Add row
            </button>
          </div>
        </div>
      );
    }

    // row.N → single RowEditForm (auto-saved).
    if (sel.kind === 'row') {
      const row = rows[sel.rowIndex];
      if (!row) {
        return (
          <div data-testid="workspace-right-rail-edit" className="flex flex-1 flex-col overflow-hidden">
            <SelectionChip type="dashboard" name={dashboardName} />
            <Placeholder
              testId="right-rail-edit-missing"
              title="Row not found"
              body="The selected row no longer exists."
            />
          </div>
        );
      }
      const items = Array.isArray(row.items) ? row.items : [];
      const updateRow = nextRow =>
        writeRows(rows.map((r, i) => (i === sel.rowIndex ? nextRow : r)), { kind: 'update_row' });

      return (
        <div data-testid="workspace-right-rail-edit" className="flex flex-1 flex-col overflow-hidden">
          {breadcrumb}
          <SelectionChip
            type="dashboard"
            name={`Row ${sel.rowIndex + 1}`}
            subtitle={`${row.height || 'medium'} · ${items.length} item${items.length === 1 ? '' : 's'}`}
            saveStatus={saveStatus}
          />
          <div data-testid="right-rail-edit-row" className="flex-1 overflow-y-auto p-3">
            <RowEditForm
              row={row}
              rowId={sel.rowIndex}
              rowIndex={sel.rowIndex}
              onRemoveRow={() =>
                writeRows(rows.filter((_, i) => i !== sel.rowIndex), { kind: 'remove_row' })
              }
              onHeightChange={height => updateRow({ ...row, height })}
              onAddItem={() =>
                updateRow({
                  ...row,
                  items: [...items, { width: 1, ...emptyLeafFields() }],
                })
              }
              onRemoveItem={itemIndex =>
                updateRow({ ...row, items: items.filter((_, i) => i !== itemIndex) })
              }
              onItemWidthChange={(itemIndex, width) =>
                updateRow({
                  ...row,
                  items: items.map((it, i) => (i === itemIndex ? { ...it, width } : it)),
                })
              }
              onItemRefChange={(itemIndex, ref) =>
                updateRow({
                  ...row,
                  items: items.map((it, i) => {
                    if (i !== itemIndex) return it;
                    const reset = { ...it, ...emptyLeafFields() };
                    if (ref && ref.type && ref.name) reset[ref.type] = formatRef(ref.name);
                    return reset;
                  }),
                })
              }
              onItemChange={(itemIndex, nextItem) =>
                updateRow({
                  ...row,
                  items: items.map((it, i) => (i === itemIndex ? nextItem : it)),
                })
              }
              onSelectRef={handleSelectRef}
            />
          </div>
        </div>
      );
    }

    // row.N.item.M → leaf form when it references an object, else ItemEditForm.
    if (sel.kind === 'item') {
      const row = rows[sel.rowIndex];
      const item = row?.items?.[sel.itemIndex];
      if (!item) {
        return (
          <div data-testid="workspace-right-rail-edit" className="flex flex-1 flex-col overflow-hidden">
            <SelectionChip type="dashboard" name={dashboardName} />
            <Placeholder
              testId="right-rail-edit-missing"
              title="Item not found"
              body="The selected item no longer exists."
            />
          </div>
        );
      }
      const leafRef = getItemLeafRef(item);
      // If the item points at a real, NAMED leaf object, drill in to that leaf's
      // existing edit form (per Q25). Inline/unnamed leaves (e.g. markdown
      // defined in place) are NOT in the object store — there is no named object
      // to open — so they fall through to the item layout editor below, which
      // renders a "defined inline" chip + a prompt to name the object rather
      // than opening an empty/broken leaf form.
      if (leafRef && !leafRef.inline && LEAF_TYPES.includes(leafRef.type)) {
        return (
          <div data-testid="workspace-right-rail-edit" className="flex flex-1 flex-col overflow-hidden">
            {breadcrumb}
            <LeafObjectForm type={leafRef.type} name={leafRef.name} onSelectRef={handleSelectRef} />
          </div>
        );
      }
      // Otherwise edit the item layout slot itself.
      const updateItem = nextItem =>
        writeRows(
          rows.map((r, ri) =>
            ri === sel.rowIndex
              ? {
                  ...r,
                  items: (r.items || []).map((it, ii) =>
                    ii === sel.itemIndex ? nextItem : it
                  ),
                }
              : r
          ),
          { kind: 'update_item' }
        );
      const removeItem = () =>
        writeRows(
          rows.map((r, ri) =>
            ri === sel.rowIndex
              ? { ...r, items: (r.items || []).filter((_, ii) => ii !== sel.itemIndex) }
              : r
          ),
          { kind: 'remove_item' }
        );

      return (
        <div data-testid="workspace-right-rail-edit" className="flex flex-1 flex-col overflow-hidden">
          {breadcrumb}
          <SelectionChip
            type="dashboard"
            name={`Item ${sel.itemIndex + 1}`}
            subtitle={
              leafRef?.inline
                ? `Row ${sel.rowIndex + 1} · inline ${leafRef.type}`
                : `Row ${sel.rowIndex + 1} · empty slot`
            }
            saveStatus={saveStatus}
          />
          <div data-testid="right-rail-edit-item" className="flex-1 overflow-y-auto p-3">
            <ItemEditForm
              item={item}
              itemId={`row-${sel.rowIndex}-item-${sel.itemIndex}`}
              itemIndex={sel.itemIndex}
              onChange={updateItem}
              onRemove={removeItem}
              onSelectRef={handleSelectRef}
              RowComponent={RowEditForm}
            />
          </div>
        </div>
      );
    }
  }

  // ── Library-row object → that type's existing edit form ────────────────────
  if (LIBRARY_EDITABLE_TYPES.includes(type)) {
    return (
      <div data-testid="workspace-right-rail-edit" className="flex flex-1 flex-col overflow-hidden">
        <LeafObjectForm type={type} name={activeObject.name} onSelectRef={handleSelectRef} />
      </div>
    );
  }

  // ── Fallback ───────────────────────────────────────────────────────────────
  return (
    <div data-testid="workspace-right-rail-edit" className="flex flex-1 flex-col overflow-hidden">
      <SelectionChip type={type} name={activeObject.name || '(unnamed)'} />
      <Placeholder
        testId="right-rail-edit-unsupported"
        title="No editor for this object yet"
        body={`Editing ${type} objects in the right rail is coming soon.`}
      />
    </div>
  );
};

/**
 * LeafObjectForm — resolves the live object record for a leaf / Library-row
 * object and renders that type's existing edit form INLINE in the right rail,
 * fronted by a <SelectionChip>. This is the Q25 "Library row / item leaf → that
 * type's edit form" contract and matches the G-1 design artboard 03 (a chart
 * item selects → an inline ChartEditForm), per VIS-802 GAP-1/GAP-2.
 *
 * Saves go through the unified `useRecordSave` backbone (one instance per open
 * record, VIS-1018 step 3 — retiring `useObjectSave`'s 13-case switch). The
 * form's `onSave(type, name, config)` flushes through `saveNow`, so every
 * standalone leaf save writes the record optimistically into its store
 * collection and persists through the same `saveX` action the rest of the app
 * uses — converging with any concurrent canvas/rail edit on the last write.
 * There is no modal to close in the rail, so `onClose`/`onCancel`/embedded-nav
 * are no-ops; the forms keep their own Save footer. A handful of compound
 * data-layer types (dashboard, csv/local-merge models) still open in their own
 * surface — they have no lightweight in-rail form yet.
 */
const INLINE_LEAF_FORMS = {
  chart: (record, common) => <ChartEditForm chart={record} {...common} />,
  table: (record, common) => <TableEditForm table={record} {...common} />,
  markdown: (record, common) => <MarkdownEditForm markdown={record} {...common} />,
  input: (record, common) => (
    <InputEditForm
      input={record}
      isCreate={common.isCreate}
      onSave={common.onSave}
      onSaveStatusChange={common.onSaveStatusChange}
      autoSave
    />
  ),
  source: (record, common) => <SourceEditForm source={record} {...common} />,
  insight: (record, common) => <InsightEditForm insight={record} {...common} />,
  model: (record, common) => (
    <ModelEditForm model={record} onSave={common.onSave} onCancel={common.onClose} />
  ),
  dimension: (record, common) => <DimensionEditForm dimension={record} {...common} />,
  metric: (record, common) => <MetricEditForm metric={record} {...common} />,
  relation: (record, common) => <RelationEditForm relation={record} {...common} />,
};

const LeafObjectForm = ({ type, name, onSelectRef }) => {
  const collectionKey = COLLECTION_KEY[type];
  const collection = useStore(s => (collectionKey ? s[collectionKey] : null));
  const openWorkspaceTab = useStore(s => s.openWorkspaceTab);
  const record = useMemo(
    () => (Array.isArray(collection) ? collection.find(o => o.name === name) || null : null),
    [collection, name]
  );
  const typeDef = getTypeByValue(type);
  const singular = typeDef?.singularLabel || type;

  // Auto-saving leaf forms (currently Input — VIS-898) report their debounced
  // save status up so the SelectionChip header renders the indicator, mirroring
  // the dashboard-structure forms.
  const [leafSaveStatus, setLeafSaveStatus] = useState(undefined);

  // No modal to close in the rail, so the forms' close/cancel/embedded-nav
  // callbacks are no-ops.
  const noop = useCallback(() => {}, []);

  // Standalone (non-embedded) save through the unified optimistic + debounced
  // backbone — one `useRecordSave` instance per open record (VIS-1018 step 3,
  // retiring `useObjectSave`). The leaf forms call `onSave(type, name, config)`;
  // `saveNow` writes the record optimistically into its store collection and
  // persists via the type's `saveX` action, so the rail save converges with any
  // concurrent canvas edit on the last write.
  const { status: recordSaveStatus, saveNow } = useRecordSave(type, name);
  const handleObjectSave = useCallback(
    (_type, _name, config) => saveNow(config),
    [saveNow]
  );

  // Prefer a leaf form's own auto-save status (Input reports its debounce via
  // onSaveStatusChange) and otherwise surface this record's save status.
  const saveStatus = leafSaveStatus !== undefined ? leafSaveStatus : recordSaveStatus;

  const renderForm = INLINE_LEAF_FORMS[type];
  if (renderForm) {
    const common = {
      isCreate: false,
      onClose: noop,
      onSave: handleObjectSave,
      onNavigateToEmbedded: noop,
      onGoBack: noop,
      onSaveStatusChange: setLeafSaveStatus,
    };
    return (
      <>
        <SelectionChip type={type} name={name} subtitle={singular} saveStatus={saveStatus} />
        <div data-testid="right-rail-edit-leaf-form" className="flex-1 overflow-y-auto">
          {renderForm(record, common)}
        </div>
      </>
    );
  }

  // Compound types without a lightweight in-rail form (dashboard, csv/local
  // merge models) — front with the chip + an affordance to open their own tab.
  return (
    <>
      <SelectionChip type={type} name={name} subtitle={singular} />
      <div
        data-testid="right-rail-edit-leaf-open"
        className="flex flex-1 flex-col items-center justify-start gap-3 px-6 py-8 text-center"
      >
        <p className="text-[12px] leading-relaxed text-gray-500">
          {singular} editing opens in its own surface.
        </p>
        <button
          type="button"
          onClick={() => openWorkspaceTab && openWorkspaceTab({ type, name })}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#713b57] px-3 text-[12.5px] font-semibold text-white shadow-sm transition-colors hover:bg-[#5a2f45]"
        >
          Open {singular}
        </button>
        {onSelectRef && null}
      </div>
    </>
  );
};

export default RightRailEditPanel;
