import React, { useCallback, useMemo } from 'react';
import { PiArrowSquareOut } from 'react-icons/pi';
import { getTypeIcon, getTypeColors } from '../../common/objectTypeConfigs';

/**
 * ProjectFieldsList — VIS-1013 (Project-level governance).
 *
 * The semantic-field half of the governance surface: a flat, project-wide list
 * of every Metric and Dimension. Mirrors ProjectRelationsList. Each row shows a
 * type chip (metric / dimension), the field name, and its SQL expression, and
 * deep-links into the metric/dimension per-object editor by opening it as a
 * workspace tab.
 *
 * Type colour + icon come exclusively from the canonical `objectTypeConfigs`
 * (metric → cyan + Analytics icon, dimension → teal + Category icon).
 */

const TYPE_META = {
  metric: { Icon: getTypeIcon('metric'), colors: getTypeColors('metric'), label: 'metric' },
  dimension: {
    Icon: getTypeIcon('dimension'),
    colors: getTypeColors('dimension'),
    label: 'dimension',
  },
};

/**
 * Merge metrics + dimensions into a single sorted list of field descriptors.
 * Each descriptor carries the semantic-field `type` so the row can pick the
 * right chip + icon from objectTypeConfigs.
 */
export const buildFieldRows = (metrics = [], dimensions = []) => {
  const rows = [
    ...(metrics || []).map(m => ({ fieldType: 'metric', obj: m })),
    ...(dimensions || []).map(d => ({ fieldType: 'dimension', obj: d })),
  ];
  return rows.sort((a, b) => a.obj.name.localeCompare(b.obj.name));
};

const FieldRow = ({ fieldType, obj, onOpen }) => {
  const meta = TYPE_META[fieldType];
  const { Icon, colors, label } = meta;
  const expression = obj?.config?.expression || '';

  const handleOpen = useCallback(
    e => {
      e.stopPropagation();
      onOpen(fieldType, obj.name);
    },
    [onOpen, fieldType, obj.name]
  );

  return (
    <li>
      <button
        type="button"
        data-testid={`project-fields-row-${obj.name}`}
        data-field-type={fieldType}
        onClick={handleOpen}
        className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
      >
        <span
          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${colors.bg} ${colors.text}`}
        >
          <Icon style={{ fontSize: 15 }} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className={`shrink-0 rounded px-1.5 py-px text-[10.5px] font-medium uppercase tracking-wide ${colors.bg} ${colors.text}`}
              data-testid={`project-fields-row-${obj.name}-chip`}
            >
              {label}
            </span>
            <span className="truncate text-[13px] font-medium text-gray-900">{obj.name}</span>
          </span>
          {expression ? (
            <code className="mt-0.5 truncate font-mono text-[11.5px] text-gray-500">
              {expression}
            </code>
          ) : (
            <span className="mt-0.5 truncate text-[11.5px] italic text-gray-400">
              no expression
            </span>
          )}
        </span>
        <PiArrowSquareOut
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-gray-500"
        />
      </button>
    </li>
  );
};

/**
 * @param {object[]} metrics     All metrics from the store ({ name, config }).
 * @param {object[]} dimensions  All dimensions from the store ({ name, config }).
 * @param {(type: string, name: string) => void} onOpenField  Deep-link callback.
 */
const ProjectFieldsList = ({ metrics = [], dimensions = [], onOpenField }) => {
  const rows = useMemo(() => buildFieldRows(metrics, dimensions), [metrics, dimensions]);

  const handleOpen = useCallback(
    (type, name) => onOpenField && onOpenField(type, name),
    [onOpenField]
  );

  if (rows.length === 0) {
    return (
      <div
        data-testid="project-fields-list"
        className="rounded-lg bg-white px-3 py-6 text-center text-[12px] text-gray-400 ring-1 ring-gray-200"
      >
        No semantic fields defined yet. Metrics and dimensions describe the
        measures and attributes your models expose.
      </div>
    );
  }

  return (
    <ul
      data-testid="project-fields-list"
      className="flex flex-col divide-y divide-gray-200 overflow-hidden rounded-lg bg-white ring-1 ring-gray-200"
    >
      {rows.map(row => (
        <FieldRow
          key={`${row.fieldType}:${row.obj.name}`}
          fieldType={row.fieldType}
          obj={row.obj}
          onOpen={handleOpen}
        />
      ))}
    </ul>
  );
};

export default ProjectFieldsList;
