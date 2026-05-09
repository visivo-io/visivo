import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import './onboarding.css';
import { hasCompletedOnboarding, readOnboardingState, writeOnboardingState } from './onboardingState';
import { fireEvent } from './telemetry';
import useChecklistProgress from './useChecklistProgress';

/**
 * Floating in-app coach that points the user at the next thing they
 * should do. Reads `currentItem` from useChecklistProgress, waits for
 * the user to be on the right route, finds the matching DOM target by
 * `data-onb-target="<id>"`, and renders a halo + arrow + tooltip on top.
 *
 * Per-item dismiss persists to onboardingState so the same hint never
 * shows twice. The widget repositions on resize / scroll and hides
 * when the target is offscreen.
 */
export default function OnboardingCoach() {
  const location = useLocation();
  const persistedRole = (readOnboardingState() || {}).role || null;
  const { currentItem } = useChecklistProgress(persistedRole);
  const [rect, setRect] = useState(null);
  const [dismissedSet, setDismissedSet] = useState(() => readDismissed());
  const tickerRef = useRef(0);

  const onRoute = currentItem
    ? location.pathname === currentItem.route ||
      (currentItem.route === '/project' && location.pathname.startsWith('/project'))
    : false;

  const targetId = currentItem?.target;
  const itemId = currentItem?.id;
  const isDismissed = itemId ? dismissedSet.has(itemId) : false;
  const shouldRender = !!currentItem && !!targetId && onRoute && !isDismissed;

  useLayoutEffect(() => {
    if (!shouldRender) {
      setRect(null);
      return undefined;
    }

    let raf = 0;
    const measure = () => {
      const el = document.querySelector(`[data-onb-target="${targetId}"]`);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    measure();
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);

    // Re-measure briefly after route changes to pick up late-mounting
    // host components.
    const interval = setInterval(measure, 250);
    const stopAt = setTimeout(() => clearInterval(interval), 3000);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
      clearInterval(interval);
      clearTimeout(stopAt);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRender, targetId, itemId, location.pathname]);

  // Telemetry: emit "shown" once per item per render lifecycle.
  useEffect(() => {
    if (shouldRender && rect && itemId && tickerRef.current !== itemId) {
      fireEvent('onboarding_coach_shown', { item_id: itemId });
      tickerRef.current = itemId;
    }
  }, [shouldRender, rect, itemId]);

  if (!hasCompletedOnboarding()) return null;
  if (!shouldRender || !rect) return null;

  const handleDismiss = () => {
    fireEvent('onboarding_coach_dismissed_per_item', { item_id: itemId });
    const persisted = readOnboardingState() || {};
    const dismissed = new Set(persisted.coach_dismissed || []);
    dismissed.add(itemId);
    writeOnboardingState({
      ...persisted,
      coach_dismissed: Array.from(dismissed),
    });
    setDismissedSet(new Set(dismissed));
  };

  // Tooltip placement: prefer below the target; fall back above if
  // there's no room below.
  const TOOLTIP_GAP = 16;
  const TOOLTIP_W = 320;
  const TOOLTIP_H_GUESS = 120;
  const haloPadding = 8;
  const halo = {
    top: rect.top - haloPadding,
    left: rect.left - haloPadding,
    width: rect.width + haloPadding * 2,
    height: rect.height + haloPadding * 2,
  };
  const wantBelow = rect.top + rect.height + TOOLTIP_GAP + TOOLTIP_H_GUESS < window.innerHeight;
  const tooltip = wantBelow
    ? {
        top: rect.top + rect.height + TOOLTIP_GAP,
        placement: 'below',
      }
    : {
        top: rect.top - TOOLTIP_GAP - TOOLTIP_H_GUESS,
        placement: 'above',
      };
  // Center tooltip horizontally over the target, clamped to viewport.
  const tooltipLeft = Math.max(
    8,
    Math.min(rect.left + rect.width / 2 - TOOLTIP_W / 2, window.innerWidth - TOOLTIP_W - 8)
  );

  return (
    <div className="onb-coach" aria-live="polite" data-testid="onboarding-coach">
      <div className="onb-coach__halo" style={halo} />
      <div
        className={`onb-coach__tooltip onb-coach__tooltip--${tooltip.placement}`}
        style={{ top: tooltip.top, left: tooltipLeft, width: TOOLTIP_W }}
        data-testid={`onboarding-coach-${itemId}`}
      >
        <div className="onb-coach__title">{currentItem.label}</div>
        <div className="onb-coach__why">{currentItem.why}</div>
        <div className="onb-coach__actions">
          <button className="onb-text-link" onClick={handleDismiss}>
            I&apos;ve got this
          </button>
        </div>
      </div>
    </div>
  );
}

function readDismissed() {
  const persisted = readOnboardingState() || {};
  return new Set(persisted.coach_dismissed || []);
}
