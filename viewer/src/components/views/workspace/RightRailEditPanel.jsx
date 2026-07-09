import React, { useCallback, useMemo, useState } from 'react';
import { PiPencil, PiPlus } from 'react-icons/pi';
import useStore from '../../../stores/store';
import useWorkspaceScope from './useWorkspaceScope';
import useDebouncedSave from './useDebouncedSave';
import SelectionChip from './SelectionChip';
import EditPanelBreadcrumb from './EditPanelBreadcrumb';
import {
  applyReorder,
  getNodeAtKey,
  tokenizeOutlineKey,
  updateSiblingsAtKey,
} from './breadcrumbNav';
import RowEditForm from '../common/RowEditForm';
import ItemEditForm, { getItemLeafRef } from '../common/ItemEditForm';
import MarkdownEditForm from '../common/MarkdownEditForm';
import InputEditForm from '../common/InputEditForm';
import ChartEditForm from '../common/ChartEditForm';
import TableEditForm from '../common/TableEditForm';
import SourceEditForm from '../common/SourceEditForm';
import InsightEditForm from '../common/InsightEditForm';
import ModelEditForm from '../common/ModelEditForm';
import CsvScriptModelEditForm from '../common/CsvScriptModelEditForm';
import LocalMergeModelEditForm from '../common/LocalMergeModelEditForm';
import SchemaLeafForm from './SchemaLeafForm';
import LevelEditForm from '../common/LevelEditForm';
import DefaultsEditForm from '../common/DefaultsEditForm';
import { getTypeByValue } from '../common/objectTypeConfigs';
import { COLLECTION_KEY } from './collectionKeys';
import useRecordSave from '../../../hooks/useRecordSave';
import RecordRunStatus from './RecordRunStatus';
import { appendEmptyItem, createRow, runDashboardConfigGate } from './itemMutations';
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
 * debounce (see useDebouncedSave).
 *
 * FORM SOURCING (VIS-996): dimension/metric/relation render through the generic
 * schema-driven <SchemaLeafForm> (field sets from the published `$defs`, not
 * bespoke JSX). csv/local-merge script models edit INLINE via their existing
 * forms (VIS-980). The remaining heavy forms (chart/table/insight/input/model/
 * markdown/source) keep their bespoke UI + save affordances pending their own
 * migration stages.
 *
 * SELECTION SOURCE: Outline-tree, Library, AND canvas — a canvas click routes
 * through `setWorkspaceSelection` (VIS-994), which writes the outline key and
 * reveals this Edit panel.
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

/**
 * Parse a selection key at ANY depth (nested container keys like
 * `row.0.item.1.row.0.item.0` included — OutlineTreePanel + breadcrumbNav both
 * emit them) via the shared `tokenizeOutlineKey` grammar. Returns:
 *   - `{ kind: 'dashboard' }` for the root / a malformed key;
 *   - `{ kind: 'row'|'item', index, rowIndex, itemIndex }` otherwise, where
 *     `index` is the node's position among its SIBLINGS, and `rowIndex` /
 *     `itemIndex` are the label-facing indexes (the nearest row token and the
 *     item token). The node itself resolves via `getNodeAtKey`.
 */
const parseOutlineKey = key => {
  const tokens = tokenizeOutlineKey(key);
  if (tokens.length === 0) return { kind: 'dashboard' };
  const last = tokens[tokens.length - 1];
  const lastRowToken = [...tokens].reverse().find(t => t.axis === 'row');
  return {
    kind: last.axis === 'item' ? 'item' : 'row',
    index: last.index,
    rowIndex: last.axis === 'row' ? last.index : lastRowToken ? lastRowToken.index : 0,
    itemIndex: last.axis === 'item' ? last.index : null,
  };
};

/**
 * ReadOnlyNotice — VIS-1025. Compact muted band shown when the cloud stage is
 * read-only (capabilities.can_edit === false): names the state and surfaces the
 * server's `edit_action` hint (e.g. "Create a draft to edit"). Local serve
 * (capabilities null) never renders this.
 */
const ReadOnlyNotice = ({ editAction }) => (
  <div
    data-testid="right-rail-readonly"
    className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-600"
  >
    <span className="font-semibold">Read-only</span>
    {editAction ? ` — ${editAction}` : ''}
  </div>
);

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
  const setWorkspaceSelection = useStore(s => s.setWorkspaceSelection);
  // Outline-key writes routed through the unified action (VIS-994); the panel
  // is already the Edit surface so no revealEdit is needed.
  const setOutlineKey = useCallback(
    key => setWorkspaceSelection(undefined, key),
    [setWorkspaceSelection]
  );
  const dashboards = useStore(s => s.dashboards);
  const saveDashboard = useStore(s => s.saveDashboard);
  const updateDashboardConfigOptimistic = useStore(s => s.updateDashboardConfigOptimistic);
  const openWorkspaceTab = useStore(s => s.openWorkspaceTab);
  // VIS-1025: null = local serve (always editable); a cloud capability object
  // with can_edit:false makes every rail write a no-op.
  const capabilities = useStore(s => s.capabilities);
  const readOnly = !!(capabilities && capabilities.can_edit === false);
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
  // VIS-993: validation errors ({path, message, keyword}[]) when the gate is
  // holding persistence — the same status/errors contract useRecordSave uses.
  const [validationErrors, setValidationErrors] = useState(null);

  /**
   * Commit a next-config: optimistically update the store (so the form, the
   * Outline tree, and the canvas reflect the edit immediately — independent of
   * the backend round-trip), then GATE persistence (VIS-993 §3): structure
   * configs are BORN valid (itemMutations), so this gate is defense-in-depth —
   * schema ($defs AJV) + leaf mutual-exclusion checks run before the debounced
   * save is armed, and an invalid config is never handed to saveDashboard. The
   * optimistic write still happens so bound surfaces stay live; only
   * PERSISTENCE is held, with `validationErrors` surfaced at the indicator.
   */
  const persistConfig = useCallback(
    (nextConfig, meta) => {
      // VIS-1025 read-only hold — BEFORE the optimistic write and BEFORE the
      // validation gate (not-allowed is not 'invalid'): structure edits under
      // a read-only stage neither write into the store nor persist.
      if (readOnly) return;
      if (updateDashboardConfigOptimistic) {
        updateDashboardConfigOptimistic(dashboardName, nextConfig);
      }
      const finish = blocked => {
        if (blocked) {
          setValidationErrors(blocked.errors);
          emitWorkspaceEvent('right_rail_autosave_blocked', {
            object: 'dashboard',
            name: dashboardName,
            errors: blocked.errors.length,
            ...meta,
          });
          return;
        }
        setValidationErrors(null);
        scheduleSave(nextConfig);
        emitWorkspaceEvent('right_rail_autosave_scheduled', {
          object: 'dashboard',
          name: dashboardName,
          ...meta,
        });
      };
      // The shared gate runner (exclusivity → sync schema → async schema)
      // delivers exactly one verdict and FAILS OPEN on gate-internal errors —
      // a crashed gate must never silently swallow the save (the
      // canvas-persist regression). Same runner as commitCanvasConfig.
      runDashboardConfigGate(nextConfig, finish);
    },
    [updateDashboardConfigOptimistic, scheduleSave, dashboardName, readOnly]
  );

  // VIS-1025: the compact read-only band rendered above every structure form
  // (LeafObjectForm renders its own — see below).
  const readOnlyNotice = readOnly ? <ReadOnlyNotice editAction={capabilities?.edit_action} /> : null;

  const writeRows = useCallback(
    (nextRows, meta) => {
      const nextConfig = { ...(dashboardConfig || {}), rows: nextRows };
      persistConfig(nextConfig, meta);
    },
    [dashboardConfig, persistConfig]
  );

  // VIS-993: while the gate holds persistence the indicator reads 'invalid'
  // (the useRecordSave status vocabulary) and the rail lists the errors.
  const effectiveSaveStatus = validationErrors ? 'invalid' : saveStatus;
  const validationBanner = validationErrors ? (
    <div
      data-testid="right-rail-validation-errors"
      className="border-b border-highlight-200 bg-highlight-50 px-3 py-2 text-[11px] leading-relaxed text-highlight-600"
    >
      <p className="font-semibold">Invalid configuration — changes are not being saved:</p>
      <ul className="mt-0.5 list-disc pl-4">
        {validationErrors.map((err, i) => (
          <li key={`${err.path}-${i}`}>
            {err.path ? `${err.path}: ` : ''}
            {err.message}
          </li>
        ))}
      </ul>
    </div>
  ) : null;

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
      // Read-only: persistConfig no-ops the move, so moving the selection key
      // would desync the breadcrumb/Edit form from the (unchanged) node. Bail
      // before touching selection.
      if (!op || !dashboardConfig || readOnly) return;
      const nextConfig = applyReorder(dashboardConfig, op);
      persistConfig(nextConfig, { kind: 'reorder', axis: op.axis });
      const nextKey = op.parentKey === 'dashboard'
        ? `${op.axis}.${op.toIndex}`
        : `${op.parentKey}.${op.axis}.${op.toIndex}`;
      if (setOutlineKey) setOutlineKey(nextKey);
    },
    [dashboardConfig, persistConfig, setOutlineKey, readOnly]
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
      // VIS-993: a new row is BORN with one empty slot (itemMutations) so it
      // stays a visible drop target (VIS-989) — no sanitize re-seeding.
      const addRow = () => writeRows([...rows, createRow()], { kind: 'add_row' });
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
            saveStatus={effectiveSaveStatus}
          />
          {readOnlyNotice}
          {validationBanner}
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
                // `onItemChange` is the SOLE item-update channel here — RowEditForm
                // always prefers it over the legacy onItemWidthChange/onItemRefChange
                // callbacks (those exist only for the bundled DashboardEditForm path),
                // so passing them alongside it would be dead code.
                <RowEditForm
                  key={rowIndex}
                  row={row}
                  rowId={rowIndex}
                  rowIndex={rowIndex}
                  onRemoveRow={() => removeRow(rowIndex)}
                  onHeightChange={height => updateRow(rowIndex, { ...row, height })}
                  onAddItem={() => updateRow(rowIndex, appendEmptyItem(row))}
                  onRemoveItem={itemIndex =>
                    updateRow(rowIndex, {
                      ...row,
                      items: (row.items || []).filter((_, i) => i !== itemIndex),
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
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary-100/40"
            >
              <PiPlus className="h-3.5 w-3.5" /> Add row
            </button>
          </div>
        </div>
      );
    }

    // row.N (any depth — nested container rows included) → single RowEditForm
    // (auto-saved). The node resolves via the shared breadcrumbNav walk and
    // writes go through `updateSiblingsAtKey`, so a nested row edits ITSELF —
    // not the whole dashboard.
    if (sel.kind === 'row') {
      const row = getNodeAtKey(rows, outlineKey)?.node;
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
        writeRows(
          updateSiblingsAtKey(rows, outlineKey, sibs =>
            sibs.map((r, i) => (i === sel.index ? nextRow : r))
          ),
          { kind: 'update_row' }
        );

      return (
        <div data-testid="workspace-right-rail-edit" className="flex flex-1 flex-col overflow-hidden">
          {breadcrumb}
          <SelectionChip
            type="dashboard"
            name={`Row ${sel.rowIndex + 1}`}
            subtitle={`${row.height || 'medium'} · ${items.length} item${items.length === 1 ? '' : 's'}`}
            saveStatus={effectiveSaveStatus}
          />
          {readOnlyNotice}
          {validationBanner}
          <div data-testid="right-rail-edit-row" className="flex-1 overflow-y-auto p-3">
            <RowEditForm
              row={row}
              rowId={sel.rowIndex}
              rowIndex={sel.rowIndex}
              onRemoveRow={() =>
                writeRows(
                  updateSiblingsAtKey(rows, outlineKey, sibs =>
                    sibs.filter((_, i) => i !== sel.index)
                  ),
                  { kind: 'remove_row' }
                )
              }
              onHeightChange={height => updateRow({ ...row, height })}
              onAddItem={() => updateRow(appendEmptyItem(row))}
              onRemoveItem={itemIndex =>
                updateRow({ ...row, items: items.filter((_, i) => i !== itemIndex) })
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

    // row.N.item.M (any depth — items in nested container rows included) →
    // leaf form when it references an object, else ItemEditForm.
    if (sel.kind === 'item') {
      const item = getNodeAtKey(rows, outlineKey)?.node;
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
          updateSiblingsAtKey(rows, outlineKey, sibs =>
            sibs.map((it, i) => (i === sel.index ? nextItem : it))
          ),
          { kind: 'update_item' }
        );
      const removeItem = () =>
        writeRows(
          updateSiblingsAtKey(rows, outlineKey, sibs =>
            sibs.filter((_, i) => i !== sel.index)
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
            saveStatus={effectiveSaveStatus}
          />
          {readOnlyNotice}
          {validationBanner}
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
  // VIS-996: dimension/metric/relation render through the generic schema-driven
  // leaf form — field sets come from the published $defs, not bespoke JSX.
  dimension: (record, common) => <SchemaLeafForm type="dimension" record={record} {...common} />,
  metric: (record, common) => <SchemaLeafForm type="metric" record={record} {...common} />,
  relation: (record, common) => <SchemaLeafForm type="relation" record={record} {...common} />,
  // VIS-980 (folded into VIS-996): the csv/local-merge script models edit INLINE
  // via their existing forms instead of routing to the "open elsewhere"
  // fallback. Delegating onSave → the rail's useRecordSave backbone, same as
  // `model`.
  csvScriptModel: (record, common) => (
    <CsvScriptModelEditForm
      model={record}
      isCreate={common.isCreate}
      onSave={common.onSave}
      onClose={common.onClose}
    />
  ),
  localMergeModel: (record, common) => (
    <LocalMergeModelEditForm
      model={record}
      isCreate={common.isCreate}
      onSave={common.onSave}
      onClose={common.onClose}
    />
  ),
};

const LeafObjectForm = ({ type, name, onSelectRef }) => {
  const collectionKey = COLLECTION_KEY[type];
  const collection = useStore(s => (collectionKey ? s[collectionKey] : null));
  const openWorkspaceTab = useStore(s => s.openWorkspaceTab);
  // VIS-1025: cloud read-only — render the form for inspection, but disabled
  // behind the Read-only notice. The write path is independently held by
  // useRecordSave's short-circuit; this is the UX affordance layer.
  const capabilities = useStore(s => s.capabilities);
  const readOnly = !!(capabilities && capabilities.can_edit === false);
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
  // retiring `useObjectSave`). `saveNow` writes the record optimistically into
  // its store collection and persists via the type's `saveX` action, so the rail
  // save converges with any concurrent canvas edit on the last write.
  //
  // Two `onSave` conventions exist across the leaf forms:
  //   - DELEGATING (chart/source/table/model/insight/input): call
  //     `onSave(type, name, config)` and rely on the rail to persist → saveNow.
  //   - SELF-SAVING (relation/dimension/metric/markdown): persist via their own
  //     store action / `useRecordSave` FIRST, then call `onSave(config)` purely
  //     as a post-save NOTIFICATION. Re-persisting that here double-fired `saveX`
  //     (VIS-1018 adversarial-review fix), so the single-arg notification is a
  //     no-op — the form already wrote the record.
  const { status: recordSaveStatus, errors: recordSaveErrors, saveNow } = useRecordSave(type, name);
  const handleObjectSave = useCallback(
    (typeOrConfig, _name, config) =>
      typeof typeOrConfig === 'string' && config !== undefined ? saveNow(config) : undefined,
    [saveNow]
  );

  // Prefer a leaf form's own auto-save status (Input reports its debounce via
  // onSaveStatusChange) and otherwise surface this record's save status.
  const saveStatus = leafSaveStatus !== undefined ? leafSaveStatus : recordSaveStatus;

  const renderForm = INLINE_LEAF_FORMS[type];

  // VIS-983 (folded into VIS-996): loading / not-found guards. A registered
  // leaf type whose record isn't resolvable must NOT hand a null record to its
  // form (blank / half-broken UI). Collections initialise to `[]` and populate
  // on the workspace's mount fetch, so the absent-record signal is ambiguous:
  //   - a NON-EMPTY collection that lacks this name → the fetch resolved with
  //     data and this record genuinely isn't in it (deleted / renamed / stale
  //     deep link) → NOT FOUND;
  //   - an EMPTY or not-yet-array collection → ambiguous (fetch may still be in
  //     flight, e.g. a fresh deep link) → LOADING, biased this way so a
  //     transient initial load never flashes a "not found" error.
  if (renderForm && !record) {
    const loading = !Array.isArray(collection) || collection.length === 0;
    return (
      <>
        <SelectionChip type={type} name={name} subtitle={singular} />
        {loading ? (
          <Placeholder
            testId="right-rail-edit-leaf-loading"
            title={`Loading ${singular}…`}
            body="Fetching the latest saved version."
          />
        ) : (
          <Placeholder
            testId="right-rail-edit-leaf-missing"
            title={`${singular.charAt(0).toUpperCase() + singular.slice(1)} not found`}
            body={`No ${singular} named "${name}" exists. It may have been deleted or renamed.`}
          />
        )}
      </>
    );
  }

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
        {readOnly && <ReadOnlyNotice editAction={capabilities?.edit_action} />}
        {/* VIS-993 §2 — the save-status block: the validation gate's 'invalid'
            errors (rail-level `path: message` list; per-field mapping comes
            with VIS-996) + the run-failure loop-back banner for THIS record,
            reading as one block with the chip's save indicator above. */}
        {recordSaveStatus === 'invalid' && recordSaveErrors?.length > 0 && (
          <div
            data-testid="record-save-errors"
            className="border-b border-highlight/30 bg-highlight-50 px-3 py-2"
          >
            <p className="text-[11.5px] font-semibold text-highlight">Not saved — fix to save</p>
            <ul className="mt-0.5 space-y-0.5">
              {recordSaveErrors.map((err, i) => (
                <li key={`${err.path || 'root'}-${i}`} className="text-[11px] text-highlight-600">
                  {err.path ? <span className="font-medium">{err.path}: </span> : null}
                  {err.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        <RecordRunStatus name={name} />
        <div data-testid="right-rail-edit-leaf-form" className="flex-1 overflow-y-auto">
          {/* None of the leaf forms take a disabled prop, so read-only uses the
              one mechanism that covers them all: a disabled <fieldset> (native
              controls + keyboard) with pointer-events held (react-select /
              contenteditable / editor surfaces). */}
          {readOnly ? (
            <fieldset
              disabled
              data-testid="right-rail-readonly-fieldset"
              className="pointer-events-none opacity-60"
            >
              {renderForm(record, common)}
            </fieldset>
          ) : (
            renderForm(record, common)
          )}
        </div>
      </>
    );
  }

  // Compound types without a lightweight in-rail form (dashboard, csv/local
  // merge models) — front with the chip + an affordance to open their own tab.
  return (
    <>
      <SelectionChip type={type} name={name} subtitle={singular} />
      <RecordRunStatus name={name} />
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
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12.5px] font-semibold text-white shadow-sm transition-colors hover:bg-primary-600"
        >
          Open {singular}
        </button>
        {onSelectRef && null}
      </div>
    </>
  );
};

export default RightRailEditPanel;
