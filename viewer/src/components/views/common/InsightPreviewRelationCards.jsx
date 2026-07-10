import React, { useEffect, useRef, useState } from 'react';
import { PiLinkSimpleBold, PiWarningBold } from 'react-icons/pi';
import useStore from '../../../stores/store';
import { getTypeColors, getTypeIcon } from '../common/objectTypeConfigs';
import JoinOperatorPopover from '../workspace/relations/JoinOperatorPopover';

/**
 * Inline relation-fix cards (VIS-1007).
 *
 * When an insight/table preview run fails because it spans two models with no
 * relation between them, the backend types the failure as
 * `error_type: 'missing_relation'` (or `'ambiguous_relation'`) and attaches the
 * offending `error_models` pair. Instead of dead-ending on a red error block,
 * InsightPreview renders one of these cards so the user authors the missing
 * relation in place — reusing VIS-1006's JoinOperatorPopover — and the preview
 * re-runs once the relation is saved.
 */

const ModelChip = ({ name }) => {
  const colors = getTypeColors('model');
  const Icon = getTypeIcon('model');
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[12px] font-medium ${colors.bg} ${colors.text} ${colors.border}`}
    >
      {Icon && <Icon style={{ fontSize: 13 }} aria-hidden="true" />}
      {name}
    </span>
  );
};

/**
 * MissingRelationCard — the "draw the join" surface. Renders a card explaining
 * the two unjoined models and a button that opens the JoinOperatorPopover seeded
 * with the model pair. On successful save it invokes `onRelationSaved` so the
 * preview re-runs.
 *
 * @param {string[]} models - The two model names from `error_models`.
 * @param {Function} onRelationSaved - Called after a relation is saved.
 */
export const MissingRelationCard = ({ models = [], onRelationSaved }) => {
  const projectModels = useStore(s => s.models);
  const fetchModels = useStore(s => s.fetchModels);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });

  const [modelA, modelB] = models;
  const colors = getTypeColors('relation');
  const Icon = getTypeIcon('relation') || PiLinkSimpleBold;

  // Hydrate the model list (with columns) the popover's pickers need.
  useEffect(() => {
    if ((!projectModels || projectModels.length === 0) && typeof fetchModels === 'function') {
      fetchModels();
    }
  }, [projectModels, fetchModels]);

  const handleOpen = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      // Anchor the portal popover just below the trigger button.
      setAnchor({ x: rect.left, y: rect.bottom + 6 });
    }
    setOpen(true);
  };

  const handleSaved = saved => {
    setOpen(false);
    if (onRelationSaved) onRelationSaved(saved);
  };

  return (
    <div
      data-testid="missing-relation-card"
      className="flex flex-col items-center justify-center h-full p-8 text-center"
    >
      <div
        className={`flex items-center gap-2 mb-3 ${colors.text}`}
        style={{ fontSize: 28 }}
        aria-hidden="true"
      >
        <Icon />
      </div>
      <h3 className="text-lg font-medium text-gray-800 mb-2">Models aren't connected yet</h3>
      <p className="text-sm text-gray-600 max-w-md mb-3">
        This preview pulls from two models with no relation between them. Draw the join below and
        the preview will re-run.
      </p>
      <div className="flex items-center gap-2 mb-4">
        <ModelChip name={modelA} />
        <span className="text-gray-400 text-sm">+</span>
        <ModelChip name={modelB} />
      </div>
      <button
        ref={buttonRef}
        type="button"
        data-testid="missing-relation-draw-join"
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white transition-colors"
        style={{ background: 'var(--color-primary-500)' }}
      >
        <PiLinkSimpleBold style={{ fontSize: 15 }} aria-hidden="true" />
        Draw the join
      </button>

      {open && (
        <JoinOperatorPopover
          x={anchor.x}
          y={anchor.y}
          models={projectModels || []}
          initialA={{ model: modelA || '', column: '' }}
          initialB={{ model: modelB || '', column: '' }}
          onClose={() => setOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
};

/**
 * AmbiguousRelationCard — a simple path-picker for the ambiguous-join case.
 * Lists the candidate relations connecting the two models so the user can pick
 * one (the picker UI is intentionally minimal for VIS-1007). Selecting a
 * relation marks it default via `saveRelation` and re-runs the preview.
 *
 * @param {string[]} models - The two model names from `error_models`.
 * @param {Function} onRelationSaved - Called after a relation is chosen.
 */
export const AmbiguousRelationCard = ({ models = [], onRelationSaved }) => {
  const relations = useStore(s => s.relations);
  const fetchRelations = useStore(s => s.fetchRelations);
  const saveRelation = useStore(s => s.saveRelation);
  const [saving, setSaving] = useState(null);
  const [modelA, modelB] = models;
  const colors = getTypeColors('relation');
  const Icon = getTypeIcon('relation') || PiWarningBold;

  useEffect(() => {
    if ((!relations || relations.length === 0) && typeof fetchRelations === 'function') {
      fetchRelations();
    }
  }, [relations, fetchRelations]);

  // Candidate relations are those whose condition references BOTH models.
  const candidates = (relations || []).filter(rel => {
    const condition = rel?.condition || rel?.config?.condition || '';
    return (
      modelA &&
      modelB &&
      condition.includes(`ref(${modelA})`) &&
      condition.includes(`ref(${modelB})`)
    );
  });

  const handlePick = async rel => {
    setSaving(rel.name);
    const config = {
      name: rel.name,
      join_type: rel.join_type || rel?.config?.join_type || 'inner',
      condition: rel.condition || rel?.config?.condition || '',
      is_default: true,
    };
    const result = await saveRelation(rel.name, config);
    setSaving(null);
    if (result?.success && onRelationSaved) onRelationSaved({ name: rel.name, config });
  };

  return (
    <div
      data-testid="ambiguous-relation-card"
      className="flex flex-col items-center justify-center h-full p-8 text-center"
    >
      <div
        className={`flex items-center gap-2 mb-3 ${colors.text}`}
        style={{ fontSize: 28 }}
        aria-hidden="true"
      >
        <Icon />
      </div>
      <h3 className="text-lg font-medium text-gray-800 mb-2">Multiple join paths</h3>
      <p className="text-sm text-gray-600 max-w-md mb-3">
        More than one relation connects these models. Pick which one this preview should use.
      </p>
      <div className="flex items-center gap-2 mb-4">
        <ModelChip name={modelA} />
        <span className="text-gray-400 text-sm">↔</span>
        <ModelChip name={modelB} />
      </div>
      {candidates.length === 0 ? (
        <p className="text-sm text-gray-500" data-testid="ambiguous-relation-empty">
          No candidate relations found. Open the Relations view to resolve this.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 w-full max-w-md" data-testid="ambiguous-relation-options">
          {candidates.map(rel => (
            <li key={rel.name}>
              <button
                type="button"
                data-testid={`ambiguous-relation-option-${rel.name}`}
                disabled={saving === rel.name}
                onClick={() => handlePick(rel)}
                className="flex w-full items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-left text-[13px] hover:bg-primary-50 disabled:opacity-50"
              >
                <span className="font-medium text-gray-700">{rel.name}</span>
                <span className="font-mono text-[11px] text-gray-400 truncate ml-3">
                  {rel.condition || rel?.config?.condition}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
