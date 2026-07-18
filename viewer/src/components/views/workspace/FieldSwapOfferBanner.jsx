import React, { useCallback } from 'react';
import { PiArrowsClockwise, PiX } from 'react-icons/pi';
import useStore from '../../../stores/store';
import { serializeSwapTarget } from '../common/pillFieldSwap';

/**
 * FieldSwapOfferBanner — Explore 2.0 Phase 4 (06 §4/§8, delta-review's
 * promote-time reclassification finding). Shared UI for BOTH swap-offer
 * triggers `pillFieldSwap.js` detects:
 *
 *   1. Match-and-replace DEDUP (06 §8, after "Save as metric"): other slots
 *      whose expression matches the just-promoted definition.
 *   2. NAME-COLLISION reclassification (delta-review, HIGH): other slots
 *      whose bare column name now collides with a just-promoted object's
 *      name and will silently start resolving to it (global-name-first).
 *
 * Both are offered EXPLICITLY, one click, never applied silently — this
 * banner is the one-click "Update N reference(s)" / "Dismiss" surface for
 * either. `offers`: `Array<{ promotedType, promotedName, slots }>`, the
 * exact shape `promoteExploration`/the Save-as-metric flow return.
 */
const FieldSwapOfferBanner = ({ offers = [], onDismiss }) => {
  const setInsightProp = useStore(s => s.setInsightProp);
  const updateInsightInteraction = useStore(s => s.updateInsightInteraction);

  const applyOffer = useCallback(
    offerIndex => {
      const offer = offers[offerIndex];
      if (!offer) return;
      offer.slots.forEach(slot => {
        const value = serializeSwapTarget(slot.swapTo);
        if (slot.location === 'prop') {
          setInsightProp(slot.insightName, slot.key, value);
        } else if (slot.location === 'interaction') {
          updateInsightInteraction(slot.insightName, slot.key, { value });
        }
      });
      onDismiss?.(offerIndex);
    },
    [offers, setInsightProp, updateInsightInteraction, onDismiss]
  );

  if (offers.length === 0) return null;

  return (
    <div className="space-y-1.5" data-testid="field-swap-offer-banner">
      {offers.map((offer, i) => (
        <div
          key={`${offer.promotedType}:${offer.promotedName}:${i}`}
          data-testid={`field-swap-offer-${offer.promotedName}`}
          className="flex items-start gap-2 rounded-md border border-primary-200 bg-primary-50 px-2.5 py-2 text-[12px] text-primary-800"
        >
          <PiArrowsClockwise size={14} className="mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p>
              <span className="font-semibold">{offer.slots.length}</span> other reference
              {offer.slots.length === 1 ? '' : 's'} match the promoted {offer.promotedType}{' '}
              <span className="font-mono font-semibold">{offer.promotedName}</span> — swap to it?
            </p>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                data-testid={`field-swap-offer-${offer.promotedName}-apply`}
                onClick={() => applyOffer(i)}
                className="rounded bg-primary-600 px-2 py-0.5 text-white hover:bg-primary-700"
              >
                Update {offer.slots.length} reference{offer.slots.length === 1 ? '' : 's'}
              </button>
              <button
                type="button"
                data-testid={`field-swap-offer-${offer.promotedName}-dismiss`}
                onClick={() => onDismiss?.(i)}
                className="rounded px-2 py-0.5 text-primary-700 hover:bg-primary-100"
              >
                Dismiss
              </button>
            </div>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => onDismiss?.(i)}
            className="text-primary-400 hover:text-primary-700"
          >
            <PiX size={12} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default FieldSwapOfferBanner;
