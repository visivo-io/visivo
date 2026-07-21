import React from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import {
  PiDotsThreeVertical,
  PiPencilSimple,
  PiCopy,
  PiTrash,
  PiWarningCircle,
} from 'react-icons/pi';
import Dropdown from '../../../common/Dropdown';
import FieldPill from '../../common/FieldPill';
import InlineRenameInput from '../InlineRenameInput';
import useInlineRename from '../../../../hooks/useInlineRename';
import { draftSummary } from '../explorationLegacyBridge';

/**
 * ExplorationCard — one "Recent explorations" gallery card (01-ux-spec.md
 * §2): name, relative edit time, draft summary ("n queries · n insights"),
 * a provenance chip when `seededFrom` is set, a staleness badge, and
 * Open / ⋮ (rename · duplicate · delete).
 *
 * Promotion count (Explore 2.0 Phase 4, 01-ux-spec.md §2's "promotion count
 * arrives in Phase 4" note): read straight off the exploration's real
 * `promoted[]` trail (empty for an exploration that's never promoted
 * anything) — no separate fetch, `workspaceExplorationsStore.js` already
 * mirrors it locally after every `promoteExploration` call.
 *
 * Staleness badge (Explore 2.0 Phase 5, VIS-1070, 01-ux-spec.md §2's
 * "⚠ stale (orders changed)" end-state): `stale`/`danglingRefs` are computed
 * by the PARENT (`ExplorerHomePane.jsx`, via `computeExplorationStaleness`)
 * for every card at once, not per-card here — this component just renders
 * whatever it's handed.
 */
const ExplorationCard = ({
  exploration,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  stale = false,
  danglingRefs = [],
}) => {
  // B16 (04-bug-inventory.md): the shared "am I editing this name" toggle —
  // see useInlineRename's docstring for why this hook exists.
  const rename = useInlineRename({ onCommit: nextName => onRename(exploration.id, nextName) });
  const { queryCount, insightCount } = draftSummary(exploration.draft);
  const promotedCount = (exploration.promoted || []).length;
  const editedLabel = exploration.updatedAt
    ? `edited ${formatDistanceToNowStrict(new Date(exploration.updatedAt), { addSuffix: true })}`
    : null;

  return (
    <div
      data-testid={`exploration-card-${exploration.id}`}
      className="rounded-lg border border-gray-200 bg-white p-4 transition-all hover:border-gray-300 hover:shadow-md"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        {rename.editing ? (
          <InlineRenameInput
            name={exploration.name}
            testIdPrefix={`exploration-card-${exploration.id}-rename`}
            onCommit={rename.commit}
            onCancel={rename.cancel}
          />
        ) : (
          <span
            data-testid={`exploration-card-${exploration.id}-name`}
            className="truncate text-[14px] font-medium text-gray-800"
          >
            {exploration.name}
          </span>
        )}
        <Dropdown
          align="right"
          width={160}
          trigger={
            <button
              type="button"
              title="More actions"
              aria-label={`More actions for ${exploration.name}`}
              data-testid={`exploration-card-${exploration.id}-menu`}
              className="-mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <PiDotsThreeVertical style={{ fontSize: 16 }} />
            </button>
          }
        >
          {close => (
            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  rename.start();
                  close();
                }}
                data-testid={`exploration-card-${exploration.id}-rename-action`}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-gray-800 hover:bg-gray-50"
              >
                <PiPencilSimple style={{ fontSize: 14 }} /> Rename
              </button>
              <button
                type="button"
                onClick={() => {
                  onDuplicate(exploration.id);
                  close();
                }}
                data-testid={`exploration-card-${exploration.id}-duplicate-action`}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-gray-800 hover:bg-gray-50"
              >
                <PiCopy style={{ fontSize: 14 }} /> Duplicate
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(exploration);
                  close();
                }}
                data-testid={`exploration-card-${exploration.id}-delete-action`}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-highlight-600 hover:bg-highlight-50"
              >
                <PiTrash style={{ fontSize: 14 }} /> Delete
              </button>
            </div>
          )}
        </Dropdown>
      </div>

      <div
        data-testid={`exploration-card-${exploration.id}-summary`}
        className="mb-3 flex flex-wrap items-center gap-1.5 text-[12px] text-gray-500"
      >
        <span>
          {[
            editedLabel,
            `${queryCount} ${queryCount === 1 ? 'query' : 'queries'}`,
            `${insightCount} ${insightCount === 1 ? 'insight' : 'insights'}`,
            promotedCount > 0 ? `${promotedCount} saved to project` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {stale && (
          <span
            data-testid={`exploration-card-${exploration.id}-stale`}
            title={
              danglingRefs.length > 0
                ? `References that no longer resolve: ${danglingRefs.join(', ')}`
                : 'This exploration references objects that may have changed'
            }
            className="inline-flex items-center gap-1 rounded-full bg-highlight-50 px-1.5 py-0.5 text-[10.5px] font-medium text-highlight-700"
          >
            <PiWarningCircle style={{ fontSize: 11 }} aria-hidden="true" />
            stale
          </span>
        )}
      </div>

      {(exploration.seededFrom || exploration.returnTo?.dashboard) && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {exploration.seededFrom && (
            <FieldPill
              type={exploration.seededFrom.type}
              name={exploration.seededFrom.name}
              label={`from ${exploration.seededFrom.type}: ${exploration.seededFrom.name}`}
            />
          )}
          {/* D10 (e2e-gap-review.md "Final delta pass"): a minted `return_to`
              placement intent was previously invisible everywhere in the UI —
              this exploration's own card looked identical to a throwaway
              scratch query. `type="dashboard"` pulls the same rose palette
              every other dashboard surface uses (objectTypeConfigs.js), so
              this reads as "destined for a dashboard", not a hand-rolled
              color. */}
          {exploration.returnTo?.dashboard && (
            <FieldPill
              type="dashboard"
              name={exploration.returnTo.dashboard}
              label={`→ ${exploration.returnTo.dashboard}`}
              title={`Destined for dashboard: ${exploration.returnTo.dashboard}`}
              data-testid={`exploration-card-${exploration.id}-return-to`}
            />
          )}
        </div>
      )}

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => onOpen(exploration.id)}
          data-testid={`exploration-card-${exploration.id}-open`}
          className="rounded-md border border-primary-200 px-3 py-1 text-[12px] font-medium text-primary-600 transition-colors hover:bg-primary-50"
        >
          Open
        </button>
      </div>
    </div>
  );
};

export default ExplorationCard;
