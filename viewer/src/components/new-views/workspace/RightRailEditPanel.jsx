import React, { useCallback, useMemo } from 'react';
import { PiPencil, PiPlus } from 'react-icons/pi';
import useStore from '../../../stores/store';
import useWorkspaceScope from './useWorkspaceScope';
import useDebouncedSave from './useDebouncedSave';
import SelectionChip from './SelectionChip';
import RowEditForm from '../common/RowEditForm';
import ItemEditForm, { getItemLeafRef } from '../common/ItemEditForm';
import MarkdownEditForm from '../common/MarkdownEditForm';
import InputEditForm from '../common/InputEditForm';
import { getTypeByValue } from '../common/objectTypeConfigs';
import { formatRef } from '../../../utils/refString';
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
 *   - Level + project-chrome                        → minimal placeholder
 *     ("edited in M-2b/M-3" — those forms are DEFERRED, not built here).
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
const COLLECTION_KEY = {
  chart: 'charts',
  table: 'tables',
  markdown: 'markdowns',
  input: 'inputs',
  source: 'sources',
  model: 'models',
  csvScriptModel: 'csvScriptModels',
  localMergeModel: 'localMergeModels',
  dimension: 'dimensions',
  metric: 'metrics',
  relation: 'relations',
  insight: 'insights',
  dashboard: 'dashboards',
};

const RightRailEditPanel = () => {
  const activeObject = useStore(s => s.workspaceActiveObject);
  const outlineKey = useStore(s => s.workspaceOutlineSelectedKey);
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
      if (updateDashboardConfigOptimistic) {
        updateDashboardConfigOptimistic(dashboardName, nextConfig);
      }
      scheduleSave(nextConfig);
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

  // ── Nothing selected ──────────────────────────────────────────────────────
  if (!activeObject) {
    return (
      <div data-testid="workspace-right-rail-edit" className="flex flex-1 flex-col overflow-hidden">
        <EmptyState />
      </div>
    );
  }

  // ── Level + project-chrome → deferred placeholders (M-2b / M-3) ────────────
  if (type === 'project') {
    return (
      <div data-testid="workspace-right-rail-edit" className="flex flex-1 flex-col overflow-hidden">
        <SelectionChip type="project" name={activeObject.name || 'project'} subtitle="Project settings" />
        <Placeholder
          testId="right-rail-edit-project-placeholder"
          title="Project settings"
          body="The project / defaults form is edited in M-3 — deferred."
        />
      </div>
    );
  }
  if (type === 'level' || type === 'defaults') {
    return (
      <div data-testid="workspace-right-rail-edit" className="flex flex-1 flex-col overflow-hidden">
        <SelectionChip type={type === 'level' ? 'dashboard' : 'defaults'} name={activeObject.name || type} />
        <Placeholder
          testId="right-rail-edit-level-placeholder"
          title={type === 'level' ? 'Level settings' : 'Defaults'}
          body="This form is edited in M-2b / M-3 — deferred."
        />
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
      // If the item points at a real leaf object, drill in to that leaf's
      // existing edit form (per Q25).
      if (leafRef && LEAF_TYPES.includes(leafRef.type)) {
        return (
          <div data-testid="workspace-right-rail-edit" className="flex flex-1 flex-col overflow-hidden">
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
          <SelectionChip
            type="chart"
            name={`Item ${sel.itemIndex + 1}`}
            subtitle={`Row ${sel.rowIndex + 1} · empty slot`}
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
 * object and renders that type's existing edit form. The reused forms bring
 * their own footer (incl. a Save button); we still front them with a
 * <SelectionChip> so the header stays consistent across the Edit tab.
 *
 * Charts / tables use richer forms (ChartEditForm / TableEditForm) that pull in
 * heavy preview machinery; to keep G-1 lean and avoid pulling the explorer
 * stack into the right rail, those two render a "open to edit" affordance for
 * now (full drill-in is wired alongside the canvas work). Markdown + Input have
 * lightweight self-contained forms and render inline.
 */
const LeafObjectForm = ({ type, name, onSelectRef }) => {
  const collectionKey = COLLECTION_KEY[type];
  const collection = useStore(s => (collectionKey ? s[collectionKey] : null));
  const openWorkspaceTab = useStore(s => s.openWorkspaceTab);
  const record = useMemo(
    () => (Array.isArray(collection) ? collection.find(o => o.name === name) || null : null),
    [collection, name]
  );
  const typeDef = getTypeByValue(type);

  const noop = useCallback(() => {}, []);

  if (type === 'markdown') {
    return (
      <>
        <SelectionChip type="markdown" name={name} />
        <div className="flex-1 overflow-hidden">
          <MarkdownEditForm markdown={record} isCreate={false} onClose={noop} onSave={noop} />
        </div>
      </>
    );
  }
  if (type === 'input') {
    return (
      <>
        <SelectionChip type="input" name={name} />
        <div className="flex-1 overflow-hidden">
          <InputEditForm input={record} isCreate={false} onClose={noop} onSave={noop} />
        </div>
      </>
    );
  }

  // Chart / Table / Data-Layer objects: front with the chip + an affordance to
  // open the object as its own tab (its full editor surface lives in the middle
  // pane / explorer). This keeps the right rail's bundle lean.
  const singular = typeDef?.singularLabel || type;
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
