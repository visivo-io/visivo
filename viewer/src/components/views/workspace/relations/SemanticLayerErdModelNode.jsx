import React from 'react';
import { Position } from 'reactflow';
import { getTypeColors, getTypeIcon } from '../../common/objectTypeConfigs';
import { NodeHandle } from '../../../styled/NodeHandle';

/**
 * SemanticLayerErdModelNode — the model card for the project-wide Semantic Layer
 * ERD (VIS-1014). Extends the Relation ERD's ErdModelNode: a tinted model header
 * over the column rows (each with a connection handle so relations can still be
 * authored column→column), PLUS two field sections beneath — the model's METRICS
 * (cyan pills) and DIMENSIONS (teal pills).
 *
 * All colours/icons come from objectTypeConfigs (model = amber, metric = cyan,
 * dimension = teal); no hand-rolled tones.
 */
const FieldPills = ({ label, names, type }) => {
  if (!names || names.length === 0) return null;
  const colors = getTypeColors(type);
  const Icon = getTypeIcon(type);
  return (
    <div data-testid={`erd-fields-${type}`} className="border-t border-gray-100 px-3 py-1.5">
      <div className="mb-1 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-gray-400">
        {Icon && <Icon style={{ fontSize: 11 }} className={colors.text} aria-hidden="true" />}
        {label}
      </div>
      <div className="flex flex-wrap gap-1">
        {names.map(name => (
          <span
            key={name}
            data-testid={`erd-${type}-pill-${name}`}
            title={name}
            className={[
              'inline-flex max-w-[120px] items-center truncate rounded px-1.5 py-0.5 text-[10px] font-medium',
              colors.bg,
              colors.text,
            ].join(' ')}
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
};

const SemanticLayerErdModelNode = ({ data, selected }) => {
  const { name, columns = [], metrics = [], dimensions = [] } = data;
  const colors = getTypeColors('model');
  const Icon = getTypeIcon('model');

  return (
    <div
      data-testid={`semantic-erd-model-node-${name}`}
      className={[
        'min-w-[200px] max-w-[280px] rounded-lg border-2 bg-white shadow-sm transition-all duration-150',
        selected ? `${colors.borderSelected} shadow-md` : colors.border,
      ].join(' ')}
    >
      <div
        className={[
          'flex items-center gap-2 rounded-t-md px-3 py-2 text-[12px] font-semibold',
          colors.bg,
          colors.text,
        ].join(' ')}
      >
        {Icon && <Icon style={{ fontSize: 16 }} className="shrink-0" aria-hidden="true" />}
        <span className="truncate" title={name}>
          {name}
        </span>
      </div>

      {columns.length > 0 ? (
        <ul className="divide-y divide-gray-100">
          {columns.map(column => (
            <li
              key={column}
              data-testid={`semantic-erd-column-${name}-${column}`}
              className="relative flex items-center px-3 py-1.5 text-[12px] text-gray-700 hover:bg-gray-50"
            >
              <NodeHandle type="target" colors={colors} id={column} position={Position.Left} />
              <span className="truncate" title={column}>
                {column}
              </span>
              <NodeHandle type="source" colors={colors} id={column} position={Position.Right} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="relative px-3 py-2 text-[11px] italic text-gray-400">
          <NodeHandle type="target" colors={colors} position={Position.Left} />
          No columns loaded
          <NodeHandle type="source" colors={colors} position={Position.Right} />
        </div>
      )}

      <FieldPills label="Metrics" names={metrics} type="metric" />
      <FieldPills label="Dimensions" names={dimensions} type="dimension" />
    </div>
  );
};

export default SemanticLayerErdModelNode;
