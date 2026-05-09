import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import './onboarding.css';
import { hasCompletedOnboarding, readOnboardingState, writeOnboardingState } from './onboardingState';
import { fireEvent } from './telemetry';
import useChecklistProgress from './useChecklistProgress';

const CHECKLIST_WIDTH = 320;
const VIEWPORT_PAD = 8;

function readDismissed() {
  const s = readOnboardingState();
  return !!(s && s.checklist_dismissed);
}

function clampToViewport(top, left, height) {
  if (typeof window === 'undefined') return { top, left };
  const maxLeft = window.innerWidth - CHECKLIST_WIDTH - VIEWPORT_PAD;
  const maxTop = window.innerHeight - height - VIEWPORT_PAD;
  return {
    top: Math.max(VIEWPORT_PAD, Math.min(top, Math.max(VIEWPORT_PAD, maxTop))),
    left: Math.max(VIEWPORT_PAD, Math.min(left, Math.max(VIEWPORT_PAD, maxLeft))),
  };
}

function readPersistedPosition() {
  const s = readOnboardingState();
  if (!s || typeof s.checklist_top !== 'number' || typeof s.checklist_left !== 'number') {
    return null;
  }
  return { top: s.checklist_top, left: s.checklist_left };
}

export default function OnboardingChecklist() {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(readDismissed());

  const persistedRole = (readOnboardingState() || {}).role || null;
  const { items, completed, total } = useChecklistProgress(persistedRole);

  const cardRef = useRef(null);
  const dragStateRef = useRef(null);
  const [position, setPosition] = useState(() => readPersistedPosition());
  const [isDragging, setIsDragging] = useState(false);

  // One-time "shown" telemetry.
  useEffect(() => {
    const persisted = readOnboardingState() || {};
    if (!dismissed && !persisted.checklist_seen_emitted) {
      fireEvent('onboarding_checklist_shown');
      writeOnboardingState({ ...readOnboardingState(), checklist_seen_emitted: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fire onboarding_checklist_completed exactly once when total === completed.
  useEffect(() => {
    if (total === 0) return;
    if (completed !== total) return;
    const persisted = readOnboardingState() || {};
    if (persisted.checklist_completed_emitted) return;
    fireEvent('onboarding_checklist_completed');
    writeOnboardingState({
      ...readOnboardingState(),
      checklist_completed_emitted: true,
    });
  }, [completed, total]);

  // Re-clamp the saved position when the viewport changes.
  useEffect(() => {
    if (!position) return;
    const onResize = () => {
      const h = cardRef.current?.offsetHeight || 0;
      setPosition(p => (p ? clampToViewport(p.top, p.left, h) : p));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [position]);

  const handleHeaderPointerDown = useCallback(e => {
    if (e.target.closest('[data-onb-no-drag]')) return;
    if (e.button !== 0) return;
    const cardEl = cardRef.current;
    if (!cardEl) return;
    const rect = cardEl.getBoundingClientRect();
    dragStateRef.current = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      startX: e.clientX,
      startY: e.clientY,
      movedPx: 0,
      cardHeight: rect.height,
    };
    e.target.setPointerCapture?.(e.pointerId);
    setIsDragging(true);
  }, []);

  const handleHeaderPointerMove = useCallback(e => {
    const ds = dragStateRef.current;
    if (!ds) return;
    const top = e.clientY - ds.offsetY;
    const left = e.clientX - ds.offsetX;
    ds.movedPx = Math.max(
      ds.movedPx,
      Math.abs(e.clientX - ds.startX) + Math.abs(e.clientY - ds.startY)
    );
    setPosition(clampToViewport(top, left, ds.cardHeight));
  }, []);

  const handleHeaderPointerUp = useCallback(e => {
    const ds = dragStateRef.current;
    if (!ds) return;
    const wasDrag = ds.movedPx > 4;
    dragStateRef.current = null;
    e.target.releasePointerCapture?.(e.pointerId);
    setIsDragging(false);
    if (wasDrag) {
      setPosition(current => {
        if (current) {
          writeOnboardingState({
            ...readOnboardingState(),
            checklist_top: current.top,
            checklist_left: current.left,
          });
        }
        return current;
      });
    } else {
      setCollapsed(c => !c);
    }
  }, []);

  if (dismissed) return null;
  if (!hasCompletedOnboarding()) return null;
  if (total > 0 && completed === total) return null;

  const handleItemClick = it => {
    if (it.done) return;
    fireEvent('onboarding_checklist_item_clicked', { item_id: it.id });
    // Clicking a checklist row is a reset for the Coach — even if the
    // user previously dismissed the per-item hint, they're now asking
    // for guidance, so undo the dismiss so the halo reappears on the
    // destination route.
    const persisted = readOnboardingState() || {};
    const dismissed = (persisted.coach_dismissed || []).filter(id => id !== it.id);
    if (dismissed.length !== (persisted.coach_dismissed || []).length) {
      writeOnboardingState({ ...persisted, coach_dismissed: dismissed });
    }
    navigate(it.route);
  };

  const handleDismiss = e => {
    e.stopPropagation();
    fireEvent('onboarding_checklist_dismissed');
    writeOnboardingState({ ...readOnboardingState(), checklist_dismissed: true });
    setDismissed(true);
  };

  const pct = total ? Math.round((completed / total) * 100) : 0;
  const dashLen = total ? (completed / total) * 88 : 0;

  const positionStyle = position
    ? { top: position.top, left: position.left, right: 'auto' }
    : undefined;

  return (
    <div
      className="onb-checklist"
      data-testid="onboarding-checklist"
      style={positionStyle}
    >
      <div
        className={`onb-checklist__card ${isDragging ? 'onb-checklist__card--dragging' : ''}`}
        ref={cardRef}
      >
        <div
          className={`onb-checklist__head ${collapsed ? '' : 'onb-checklist__head--bordered'}`}
          onPointerDown={handleHeaderPointerDown}
          onPointerMove={handleHeaderPointerMove}
          onPointerUp={handleHeaderPointerUp}
          onPointerCancel={handleHeaderPointerUp}
          role="button"
          aria-label="Onboarding checklist — drag to move, click to collapse"
          tabIndex={0}
          style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        >
          <div>
            <div className="onb-checklist__title">Get started with Visivo</div>
            <div className="onb-checklist__sub">
              {completed} of {total} complete
            </div>
          </div>
          <div
            data-onb-no-drag
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            onPointerDown={e => e.stopPropagation()}
            onClick={() => setCollapsed(c => !c)}
          >
            <div className="onb-checklist__progress">
              <svg
                viewBox="0 0 36 36"
                style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}
              >
                <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="3" />
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="var(--color-primary-500)"
                  strokeWidth="3"
                  strokeDasharray={`${dashLen} 88`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="onb-checklist__progress-text">{pct}%</div>
            </div>
            <span style={{ fontSize: 14, color: 'var(--onb-fg-muted)' }}>
              {collapsed ? '▴' : '▾'}
            </span>
          </div>
        </div>
        {!collapsed && (
          <div className="onb-checklist__items">
            {items.map(it => (
              <div
                key={it.id}
                role={it.done ? undefined : 'button'}
                tabIndex={it.done ? -1 : 0}
                className={`onb-checklist__item ${it.done ? 'onb-checklist__item--done' : ''}`}
                onClick={() => handleItemClick(it)}
                onKeyDown={e => {
                  if (it.done) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleItemClick(it);
                  }
                }}
                title={it.why}
                data-testid={`onb-checklist-${it.id}`}
                aria-disabled={it.done || undefined}
              >
                <div
                  className={`onb-checklist__check ${it.done ? 'onb-checklist__check--done' : ''}`}
                  aria-hidden="true"
                >
                  {it.done ? '✓' : ''}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    className={`onb-checklist__label ${
                      it.done ? 'onb-checklist__label--done' : ''
                    }`}
                  >
                    {it.label}
                  </div>
                  {!it.done && <div className="onb-checklist__why">{it.why}</div>}
                </div>
                {!it.done && <span className="onb-checklist__chev">→</span>}
              </div>
            ))}
            <div className="onb-checklist__foot">
              <button className="onb-text-link" style={{ fontSize: 11, padding: 0 }} onClick={handleDismiss}>
                Dismiss
              </button>
              <span className="onb-checklist__foot-note">auto-clears at 100%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
