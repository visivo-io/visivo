import React, { useCallback, useMemo } from 'react';
import { PiArrowSquareOut } from 'react-icons/pi';
import { getTypeIcon, getTypeColors } from '../../common/objectTypeConfigs';
import { extractRefNames } from '../../../../utils/refString';

/**
 * ProjectRelationsList — VIS-1013 (Project-level governance).
 *
 * A flat, project-wide list of every Relation. This is the governance surface's
 * relation half: it ignores dashboard/level grouping and simply enumerates the
 * semantic-layer joins so a steward can audit them at a glance. Each row shows
 * the relation name, a compact summary of the join (join type + the models the
 * condition references), and deep-links into that relation's per-object editor
 * by opening it as a workspace tab.
 *
 * The involved models are derived from the relation's
 * `${ref(model).field} = ${ref(model).field}` condition via the shared
 * `extractRefNames` ref-string helper (this is ref parsing, NOT SQL parsing).
 *
 * Colour + icon come exclusively from the canonical `objectTypeConfigs` (the
 * `relation` type → blue + AccountTree icon), never hand-rolled here.
 */

const RelationIcon = getTypeIcon('relation');
const RELATION_COLORS = getTypeColors('relation');

/**
 * Build a compact one-line summary of a relation's join: the join type plus the
 * distinct models the condition references (e.g. "inner · orders ↔ customers").
 * Falls back gracefully when the condition is empty or references <2 models.
 */
export const summarizeRelation = relation => {
  const cfg = relation?.config || {};
  const joinType = cfg.join_type || 'inner';
  const models = Array.from(new Set(extractRefNames(cfg.condition || '')));
  return { joinType, models };
};

const RelationRow = ({ relation, onOpen }) => {
  const { joinType, models } = summarizeRelation(relation);
  const handleOpen = useCallback(
    e => {
      e.stopPropagation();
      onOpen(relation.name);
    },
    [onOpen, relation.name]
  );

  return (
    <li>
      <button
        type="button"
        data-testid={`project-relations-row-${relation.name}`}
        onClick={handleOpen}
        className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
      >
        <span
          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${RELATION_COLORS.bg} ${RELATION_COLORS.text}`}
        >
          <RelationIcon style={{ fontSize: 15 }} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-medium text-gray-900">
            {relation.name}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11.5px] text-gray-500">
            <span
              className={`shrink-0 rounded px-1.5 py-px text-[10.5px] font-medium uppercase tracking-wide ${RELATION_COLORS.bg} ${RELATION_COLORS.text}`}
            >
              {joinType}
            </span>
            {models.length > 0 ? (
              <span className="truncate" data-testid={`project-relations-row-${relation.name}-models`}>
                {models.join(' ↔ ')}
              </span>
            ) : (
              <span className="truncate italic text-gray-400">no models referenced</span>
            )}
          </span>
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
 * @param {object[]} relations  All relations from the store ({ name, config }).
 * @param {(name: string) => void} onOpenRelation  Deep-link callback.
 */
const ProjectRelationsList = ({ relations = [], onOpenRelation }) => {
  const list = useMemo(
    () => [...(relations || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [relations]
  );

  const handleOpen = useCallback(
    name => onOpenRelation && onOpenRelation(name),
    [onOpenRelation]
  );

  if (list.length === 0) {
    return (
      <div
        data-testid="project-relations-list"
        className="rounded-lg bg-white px-3 py-6 text-center text-[12px] text-gray-400 ring-1 ring-gray-200"
      >
        No relations defined yet. Relations join two models so the semantic layer
        can combine them.
      </div>
    );
  }

  return (
    <ul
      data-testid="project-relations-list"
      className="flex flex-col divide-y divide-gray-200 overflow-hidden rounded-lg bg-white ring-1 ring-gray-200"
    >
      {list.map(relation => (
        <RelationRow key={relation.name} relation={relation} onOpen={handleOpen} />
      ))}
    </ul>
  );
};

export default ProjectRelationsList;
