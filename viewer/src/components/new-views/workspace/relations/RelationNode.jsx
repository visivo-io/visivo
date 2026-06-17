import React from 'react';
import { Handle, Position } from 'reactflow';
import { getTypeColors, getTypeIcon } from '../../common/objectTypeConfigs';

/**
 * RelationNode — a relation rendered as a FIRST-CLASS React Flow node.
 *
 * The relation ERD used to draw a relation as a model→model edge with a pill
 * label. Now each relation is its own draggable node: a small pill styled
 * EXACTLY like the metric / dimension field pills on a model card (same visual
 * weight as the cyan metric / teal dimension pills), so the surface reads
 * consistently. Two undirected relation-coloured `relationLinkEdge` lines run
 * from this pill to each participating model's column.
 *
 * All colours + the icon come from objectTypeConfigs ('relation' = blue); no
 * hand-rolled hex / Tailwind tones.
 *
 * Handles: a `target` Handle on the LEFT and a `source` Handle on the RIGHT, so
 * `modelA → relNode` can enter the left and `relNode → modelB` exit the right.
 * The custom link edge computes facing-side geometry; these handles exist for
 * React-Flow connection validity. They're decorative (not draggable connect
 * points), so they sit flush at the pill's vertical center.
 *
 * Clicking the node opens the existing relation editor — wired by the canvas via
 * `onNodeClick` (not an inner handler, which would fight node drag).
 */
const RelationNode = ({ data = {}, selected }) => {
  const { relationName, isDefault } = data;
  const colors = getTypeColors('relation');
  const Icon = getTypeIcon('relation');

  return (
    <div
      data-testid={`erd-relation-node-${relationName}`}
      title={data.condition || relationName}
      className={[
        'relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold shadow-sm transition-all duration-150',
        colors.bg,
        colors.text,
        selected ? colors.borderSelected : colors.border,
      ].join(' ')}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: colors.connectionHandle,
          width: 8,
          height: 8,
          border: '2px solid white',
        }}
      />

      {/* Inner pill content keeps a stable testid the e2e selectors resolve. */}
      <span
        data-testid={`erd-relation-pill-${relationName}`}
        className="inline-flex items-center gap-1.5"
      >
        {Icon && <Icon style={{ fontSize: 13 }} className="shrink-0" aria-hidden="true" />}
        <span className="max-w-[160px] truncate" title={relationName}>
          {relationName}
        </span>
        {isDefault && (
          <span
            data-testid={`erd-relation-default-${relationName}`}
            aria-label="default"
            title="Default relation"
            className="text-amber-500"
          >
            ★
          </span>
        )}
      </span>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: colors.connectionHandle,
          width: 8,
          height: 8,
          border: '2px solid white',
        }}
      />
    </div>
  );
};

export default RelationNode;
