import React, { useState } from 'react';
import LibraryRow, { getTypeDef } from './LibraryRow';

/**
 * LibraryModelRow — a model row that can expand to show the fields defined
 * inside it, mirroring the source → table → column drill-down.
 *
 * Model-scoped metrics and dimensions used to be listed flat, alongside
 * standalone ones and indistinguishable from them. That is not a cosmetic
 * problem: a nested field is plain SQL where `${ref()}` is a hard save-time
 * error (`sql_model.py`), while a standalone one is authored WITH refs. Two
 * things that look identical and obey different rules is the worst
 * combination, and the flat list gave the user nothing to go on.
 *
 * Nesting them under their owner makes the relationship structural rather than
 * something to infer from a badge. It also answers "what does this model
 * define?" — previously only answerable by opening each field in turn.
 *
 * The children come from the SAME `dimensions`/`metrics` collections the flat
 * lists used, just regrouped, so they inherit the refetch those stores already
 * do on save. Reading them from `models[].config` instead would have been more
 * direct and staler — nothing refetches models after a field is saved.
 */
export const LibraryModelRow = ({
  obj,
  selected,
  draggable,
  onClick,
  onContextAction,
  canAddToExploration,
  nestedFields,
}) => {
  const [expanded, setExpanded] = useState(false);
  const dimensions = nestedFields?.dimension || [];
  const metrics = nestedFields?.metric || [];
  const total = dimensions.length + metrics.length;

  return (
    <>
      <LibraryRow
        obj={obj}
        selected={selected}
        draggable={draggable}
        onClick={onClick}
        onContextAction={onContextAction}
        canAddToExploration={canAddToExploration}
        // A model with nothing defined inside it gets no chevron — an expander
        // that opens onto an empty list is a dead affordance.
        expandable={total > 0}
        expanded={expanded}
        onToggleExpand={e => {
          e?.stopPropagation?.();
          setExpanded(v => !v);
        }}
      />
      {expanded && total > 0 && (
        <ul
          className="flex flex-col gap-px"
          data-testid={`library-model-${obj.name}-fields`}
        >
          {[...dimensions, ...metrics].map(field => (
            <li key={field.id} className="relative pl-4">
              <LibraryRow
                obj={field}
                selected={false}
                // Same drag affordances a top-level field row has — a nested
                // dimension is still a legal thing to drop into an exploration.
                draggable={
                  getTypeDef(field.type).explorationDragSource ||
                  getTypeDef(field.type).propertyDragSource
                }
                onClick={onClick}
                onContextAction={onContextAction}
                canAddToExploration={canAddToExploration}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
};

export default LibraryModelRow;
