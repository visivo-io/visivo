import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

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
  const navigate = useNavigate();
  const persistedRole = (readOnboardingState() || {}).role || null;
  const { currentItem } = useChecklistProgress(persistedRole);
  const [rect, setRect] = useState(null);
  const [dismissedSet, setDismissedSet] = useState(() => readDismissed());
  const tickerRef = useRef(0);

  // The OnboardingChecklist clears `coach_dismissed` for an item when
  // the user clicks its row. Re-pick up that change on every route
  // transition so the Coach immediately re-shows on the destination.
  useEffect(() => {
    setDismissedSet(readDismissed());
  }, [location.pathname]);

  // D8 (e2e-gap-review.md delta pass), extended by P6-D5: a route match
  // must also cover a deeper sub-path of `currentItem.route`, not just an
  // exact string match — `build_model`, `create_insight`, and
  // `define_metric` all advertise the bare `/workspace/exploration` gallery
  // route, but `OnboardingChecklist`'s `mintsExploration`/
  // `routeToActiveExploration` handling (see its `handleItemClick`) now
  // lands the user on `/workspace/exploration/:id` instead, so the Coach
  // must still recognize itself as "on route" there. Generalizes the
  // pre-existing `/project` special case (a dashboard sub-route) into the
  // same rule rather than special-casing `/workspace/exploration` a second
  // time.
  const onRoute = currentItem
    ? location.pathname === currentItem.route ||
      location.pathname.startsWith(`${currentItem.route}/`)
    : false;

  // For multi-step macro items, the Coach points at the active step
  // (the first incomplete substep). For simple items it points at the
  // item's own target. Both label + tip swap accordingly so the user
  // sees a focused next-action prompt that updates as they progress.
  const activeStep = currentItem?.currentStep || null;
  const targetId = activeStep ? activeStep.target : currentItem?.target;
  const itemId = currentItem?.id;
  const stepId = activeStep?.id;
  const halloKey = activeStep ? `${itemId}:${stepId}` : itemId;
  const tooltipTitle = activeStep ? activeStep.label : currentItem?.label;
  const tooltipBody = activeStep ? activeStep.tip : currentItem?.why;
  const isDismissed = itemId ? dismissedSet.has(itemId) : false;
  const shouldRender = !!currentItem && !!targetId && onRoute && !isDismissed;
  // Off-route hint: when there's an incomplete item that lives on a
  // different page, render a small floating pill so the user knows
  // there's still something to do and can jump back in one click.
  // Hidden after dismiss (same per-item flag).
  const showOffRouteChip = !!currentItem && !onRoute && !isDismissed;

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
        return false;
      }
      const r = el.getBoundingClientRect();
      // Skip noise from elements that briefly mount with 0×0 box.
      if (r.width === 0 && r.height === 0) {
        setRect(null);
        return false;
      }
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      return true;
    };

    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);

    // Try once eagerly. If the target isn't there yet, watch the DOM
    // until it mounts — far more reliable than polling, especially on
    // slow async routes (the Editor's first paint is ~1.5s after the
    // route handler resolves, well past the previous 3s polling
    // budget).
    const found = measure();
    let observer = null;
    let warnTimer = null;

    if (!found) {
      observer = new MutationObserver(() => {
        if (measure()) {
          observer.disconnect();
          observer = null;
          if (warnTimer) {
            clearTimeout(warnTimer);
            warnTimer = null;
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      // Dev-only: if the target stays missing for 5s, the marker
      // probably renamed or moved. Loud breakage > silent breakage.
      if (process.env.NODE_ENV !== 'production') {
        warnTimer = setTimeout(() => {
          // eslint-disable-next-line no-console
          console.warn(
            `[OnboardingCoach] currentItem "${itemId}" advertises target "${targetId}" but no element with [data-onb-target="${targetId}"] mounted on ${location.pathname} within 5s. The hint is silently hidden. ` +
              `Fix: add data-onb-target="${targetId}" to the host component, or update the manifest entry. ` +
              `The Playwright anchor sweep (viewer/e2e/stories/onboarding-coach-anchors.spec.mjs) is the canonical guard against this regressing again.`
          );
        }, 5000);
      }
    }

    // Re-measure after layout settles in case the target moves
    // (Plotly resizes, fonts load, etc).
    const settle = setTimeout(measure, 600);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
      if (observer) observer.disconnect();
      if (warnTimer) clearTimeout(warnTimer);
      clearTimeout(settle);
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

  // Esc-to-dismiss for keyboard users.
  useEffect(() => {
    if (!shouldRender || !itemId) return undefined;
    const onKey = e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dismissCoach(itemId, setDismissedSet);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shouldRender, itemId]);

  // When the user actually clicks the highlighted target, fire telemetry
  // so we can measure prompt → click conversion in PostHog.
  useEffect(() => {
    if (!shouldRender || !targetId || !itemId) return undefined;
    const el = document.querySelector(`[data-onb-target="${targetId}"]`);
    if (!el) return undefined;
    const onClick = () => {
      fireEvent('onboarding_coach_target_clicked', { item_id: itemId });
    };
    el.addEventListener('click', onClick, { once: true });
    return () => el.removeEventListener('click', onClick);
  }, [shouldRender, targetId, itemId]);

  if (!hasCompletedOnboarding()) return null;

  if (showOffRouteChip) {
    // No wrapper — the button itself carries the testid + position so
    // Playwright's "visible" check matches the button's bounding box,
    // not a collapsed wrapper.
    return (
      <button
        type="button"
        className="onb-coach__chip"
        onClick={() => {
          fireEvent('onboarding_coach_chip_clicked', { item_id: itemId });
          navigate(currentItem.route);
        }}
        data-testid="onboarding-coach-chip"
        data-onb-chip-item={itemId}
      >
        <span className="onb-coach__chip-dot" aria-hidden="true" />
        <span className="onb-coach__chip-label">Next: {currentItem.label}</span>
        <span className="onb-coach__chip-arrow" aria-hidden="true">
          →
        </span>
      </button>
    );
  }

  if (!shouldRender || !rect) return null;

  // Scroll-offscreen handling: if the target is fully above or below the
  // viewport (e.g. the user scrolled past it), render a pinned chip at
  // the appropriate edge instead of drawing the halo offscreen — clicking
  // the chip scrolls the target back into view. Partial visibility still
  // renders the normal Coach so the user can finish what they started.
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 0;
  const offscreenAbove = rect.top + rect.height < 0;
  const offscreenBelow = rect.top > viewportH;
  if (offscreenAbove || offscreenBelow) {
    const direction = offscreenAbove ? 'up' : 'down';
    return (
      <button
        type="button"
        className={`onb-coach__scroll-chip onb-coach__scroll-chip--${direction}`}
        onClick={() => {
          fireEvent('onboarding_coach_scroll_chip_clicked', { item_id: itemId });
          const el = document.querySelector(`[data-onb-target="${targetId}"]`);
          if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }}
        data-testid="onboarding-coach-scroll-chip"
        data-onb-scroll-dir={direction}
      >
        <span className="onb-coach__scroll-chip-arrow" aria-hidden="true">
          {direction === 'up' ? '↑' : '↓'}
        </span>
        <span className="onb-coach__scroll-chip-label">{tooltipTitle}</span>
      </button>
    );
  }

  const handleDismiss = () => dismissCoach(itemId, setDismissedSet);

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

  // Keyed on itemId so the appear keyframes replay smoothly when the
  // user finishes one item and the next one becomes current (otherwise
  // the same DOM nodes hard-snap to new positions, which feels broken).
  // Tiny step pip strip rendered above the title for multi-step items
  // so the user can see they're on step N of M without leaving the
  // tooltip. Hidden for single-step items to keep them visually quiet.
  const stepCount = currentItem?.steps?.length ?? 0;
  const stepIndex = stepCount
    ? Math.max(0, currentItem.steps.findIndex(s => s.id === stepId))
    : -1;

  return (
    <div className="onb-coach" data-testid="onboarding-coach">
      <div
        key={`halo-${halloKey}`}
        className="onb-coach__halo"
        style={halo}
        aria-hidden="true"
      />
      <div
        key={`tip-${halloKey}`}
        className={`onb-coach__tooltip onb-coach__tooltip--${tooltip.placement}`}
        style={{ top: tooltip.top, left: tooltipLeft, width: TOOLTIP_W }}
        data-testid={`onboarding-coach-${itemId}`}
        data-onb-coach-step={stepId || undefined}
        role="status"
        aria-live="polite"
      >
        {stepCount > 1 && (
          <div
            className="onb-coach__steps"
            aria-label={`Step ${stepIndex + 1} of ${stepCount}`}
          >
            {currentItem.steps.map((s, i) => (
              <span
                key={s.id}
                className={`onb-coach__step-pip ${
                  s.done
                    ? 'onb-coach__step-pip--done'
                    : i === stepIndex
                    ? 'onb-coach__step-pip--current'
                    : ''
                }`}
              />
            ))}
            <span className="onb-coach__step-label">
              Step {stepIndex + 1} of {stepCount} · {currentItem.label}
            </span>
          </div>
        )}
        <div className="onb-coach__title">{tooltipTitle}</div>
        <div className="onb-coach__why">{tooltipBody}</div>
        <div className="onb-coach__actions">
          <button
            className="onb-text-link"
            onClick={handleDismiss}
            aria-label={`Dismiss the onboarding hint for ${currentItem.label}`}
          >
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

function dismissCoach(itemId, setDismissedSet) {
  if (!itemId) return;
  fireEvent('onboarding_coach_dismissed_per_item', { item_id: itemId });
  const persisted = readOnboardingState() || {};
  const dismissed = new Set(persisted.coach_dismissed || []);
  dismissed.add(itemId);
  writeOnboardingState({
    ...persisted,
    coach_dismissed: Array.from(dismissed),
  });
  setDismissedSet(new Set(dismissed));
}
