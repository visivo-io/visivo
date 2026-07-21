import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Position } from 'reactflow';
import { PiCompass } from 'react-icons/pi';
import { getTypeColors, getTypeIcon } from '../../common/objectTypeConfigs';
import { NodeHandle } from '../../../styled/NodeHandle';
import useStore from '../../../../stores/store';
import { emitWorkspaceEvent } from '../telemetry';

/**
 * SemanticLayerErdModelNode — the model card for the project-wide Semantic Layer
 * ERD (VIS-1014). Extends the Relation ERD's ErdModelNode: a tinted model header
 * over the column rows (each with a connection handle so relations can still be
 * authored column→column), PLUS two field sections beneath — the model's METRICS
 * (cyan pills) and DIMENSIONS (teal pills).
 *
 * All colours/icons come from objectTypeConfigs (model = amber, metric = cyan,
 * dimension = teal); no hand-rolled tones.
 *
 * Pills are clickable "Explore this" back-links (VIS-1069, 01-ux-spec.md §5) —
 * mints a new exploration seeded from that field, pre-wired against its
 * parent model via `buildExplorationSeedState`, and opens its tab. Buttons
 * (not spans) so the affordance is keyboard-reachable; `stopPropagation` on
 * both mouse and pointer events keeps the click from also firing React
 * Flow's node click/drag handling on the card underneath.
 */
const FieldPills = ({ label, names, type }) => {
  const createExploration = useStore(s => s.createExploration);
  const buildExplorationSeedState = useStore(s => s.buildExplorationSeedState);
  const openWorkspaceTab = useStore(s => s.openWorkspaceTab);

  // P5-D4 (e2e-gap-review.md): a rapid double-click used to mint TWO
  // exploration records — this pill had neither a `disabled` state nor an
  // in-flight ref, unlike `ExplorationPane.jsx`'s `handleDuplicate`
  // (`duplicatingRef`), which documents exactly why `disabled` alone is
  // insufficient: a real double-click can dispatch both click events before
  // React re-renders the button disabled. Mirrors that pattern here — a
  // synchronous, per-field-name in-flight ref checked-and-set BEFORE the
  // async `createExploration()` call, cleared in a `finally`. Keyed by name
  // (not a single boolean) so exploring one field never blocks a DIFFERENT
  // field's own pill in the same section. `disabled` state is layered on
  // top purely as the visible affordance.
  const exploringRef = useRef(new Set());
  const [exploringNames, setExploringNames] = useState(() => new Set());

  const handleExploreField = useCallback(
    name => {
      if (!createExploration) return;
      if (exploringRef.current.has(name)) return;
      exploringRef.current.add(name);
      setExploringNames(new Set(exploringRef.current));
      const seed = { type, name };
      const legacyStateOverride = buildExplorationSeedState
        ? buildExplorationSeedState(seed)
        : null;
      createExploration(seed, null, legacyStateOverride)
        .then(result => {
          if (result?.success && openWorkspaceTab) {
            openWorkspaceTab({
              id: `exploration:${result.id}`,
              type: 'exploration',
              name: result.id,
            });
            emitWorkspaceEvent('explore_this_used', { source_type: type });
          }
        })
        .finally(() => {
          exploringRef.current.delete(name);
          setExploringNames(new Set(exploringRef.current));
        });
    },
    [type, createExploration, buildExplorationSeedState, openWorkspaceTab]
  );

  // A remount (e.g. the model's field list changing identity) must never
  // leave a stale name stuck disabled forever.
  useEffect(() => {
    const inFlight = exploringRef.current;
    return () => {
      inFlight.clear();
    };
  }, []);

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
          <button
            key={name}
            type="button"
            data-testid={`erd-${type}-pill-${name}`}
            title={`Explore ${name}`}
            disabled={exploringNames.has(name)}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              handleExploreField(name);
            }}
            className={[
              'inline-flex max-w-[120px] items-center truncate rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
              'cursor-pointer hover:ring-1 hover:ring-inset disabled:cursor-not-allowed disabled:opacity-60',
              colors.bg,
              colors.text,
            ].join(' ')}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
};

/**
 * ExploreModelButton — Phase 6c-T5 (ux-audit.md "No 'Explore this' entry
 * point from Semantic Layer ERD — nodes are completely inert" finding).
 * `FieldPills` above already gives metric/dimension pills a working "Explore
 * this" click (VIS-1069); the model card's OWN header had nothing — no
 * click, no right-click, no visible affordance at all. This is a VISIBLE,
 * always-on icon button (not hover-only, not right-click-only — the audit's
 * direction is "at least one visible, labeled path per surface") that mints
 * an exploration seeded from the whole model, mirroring `FieldPills`'
 * double-click guard (`exploringRef`) exactly.
 */
const ExploreModelButton = ({ name, colors }) => {
  const createExploration = useStore(s => s.createExploration);
  const buildExplorationSeedState = useStore(s => s.buildExplorationSeedState);
  const openWorkspaceTab = useStore(s => s.openWorkspaceTab);
  const exploringRef = useRef(false);
  const [exploring, setExploring] = useState(false);

  const handleClick = useCallback(
    e => {
      e.stopPropagation();
      if (!createExploration || exploringRef.current) return;
      exploringRef.current = true;
      setExploring(true);
      const seed = { type: 'model', name };
      const legacyStateOverride = buildExplorationSeedState ? buildExplorationSeedState(seed) : null;
      createExploration(seed, null, legacyStateOverride)
        .then(result => {
          if (result?.success && openWorkspaceTab) {
            openWorkspaceTab({ id: `exploration:${result.id}`, type: 'exploration', name: result.id });
            emitWorkspaceEvent('explore_this_used', { source_type: 'model' });
          }
        })
        .finally(() => {
          exploringRef.current = false;
          setExploring(false);
        });
    },
    [name, createExploration, buildExplorationSeedState, openWorkspaceTab]
  );

  return (
    <button
      type="button"
      data-testid={`semantic-erd-model-explore-${name}`}
      title={`Explore ${name}`}
      aria-label={`Explore ${name}`}
      disabled={exploring}
      onPointerDown={e => e.stopPropagation()}
      onClick={handleClick}
      className={[
        'ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors',
        'hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-60',
        colors.text,
      ].join(' ')}
    >
      <PiCompass style={{ fontSize: 13 }} aria-hidden="true" />
    </button>
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
        <span className="min-w-0 flex-1 truncate" title={name}>
          {name}
        </span>
        <ExploreModelButton name={name} colors={colors} />
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
