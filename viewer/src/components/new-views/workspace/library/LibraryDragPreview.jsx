import React from 'react';
import {
  PiChartBar,
  PiLightbulb,
  PiCube,
  PiDatabase,
  PiArticle,
  PiSquaresFour,
  PiRows,
  PiTextColumns,
  PiTable,
} from 'react-icons/pi';

/**
 * LibraryDragPreview — VIS-776 / Track C C3.
 *
 * The "pill" rendered inside the workspace's `<DragOverlay>` when a row is
 * being dragged out of the Library. Per the C-1 design notes, the pill is
 * the design-system primitive for any library-style drag in the workspace:
 *
 *   white card + mulberry ring + small type icon + name + uppercase type chip
 *
 * Track D wires up the parent `<DndContext>` + `<DragOverlay>` on the
 * canvas; this component just renders the pill from the drag's `active.data`
 * payload.
 */
const TYPE_LABEL = {
  chart: 'Chart',
  insight: 'Insight',
  model: 'Model',
  source: 'Source',
  table: 'Table',
  markdown: 'Markdown',
  input: 'Input',
  dashboard: 'Dashboard',
  insert: 'Insert',
  row: 'Row',
  item: 'Item',
};

const TYPE_ICON = {
  chart: PiChartBar,
  insight: PiLightbulb,
  model: PiCube,
  source: PiDatabase,
  table: PiTable,
  markdown: PiArticle,
  dashboard: PiSquaresFour,
  insert: PiCube,
  row: PiRows,
  item: PiTextColumns,
};

const INSERT_ICON_BY_SUBTYPE = {
  dashboard: PiSquaresFour,
  row: PiRows,
  item: PiTextColumns,
  markdown: PiArticle,
};

const LibraryDragPreview = ({ data }) => {
  if (!data || data.source !== 'library') return null;
  const { type, name, subtype } = data;
  const label =
    type === 'insert' && subtype ? TYPE_LABEL[subtype] || subtype : TYPE_LABEL[type] || type;
  const Icon =
    type === 'insert' && subtype && INSERT_ICON_BY_SUBTYPE[subtype]
      ? INSERT_ICON_BY_SUBTYPE[subtype]
      : TYPE_ICON[type] || PiCube;

  return (
    <div
      data-testid="library-drag-preview"
      className="pointer-events-none inline-flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5 shadow-lg ring-1 ring-[#713b57]"
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5 text-[#713b57]" />
      <span className="text-[13px] font-medium text-gray-900">{name}</span>
      <span className="ml-1 inline-flex h-4 items-center rounded-sm bg-[#e2d7dd] px-1 text-[10px] font-bold uppercase tracking-wide text-[#5a2f45]">
        {label}
      </span>
    </div>
  );
};

export default LibraryDragPreview;
