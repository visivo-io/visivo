import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import './onboarding.css';
import useStore from '../../stores/store';
import { hasCompletedOnboarding, readOnboardingState, writeOnboardingState } from './onboardingState';
import { fireEvent } from './telemetry';

const ITEMS = [
  {
    id: 'connect_source',
    label: 'Connect a data source',
    why: 'A Source is the connection to where your data already lives.',
    href: '/explorer',
  },
  {
    id: 'build_model',
    label: 'Build a Model in Explorer',
    why: 'A Model is a re-usable SQL definition you\'ll chart from.',
    href: '/explorer',
  },
  {
    id: 'create_insight',
    label: 'Create an Insight in Explorer',
    why: 'An Insight is a chart on top of a Model.',
    href: '/explorer',
  },
  {
    id: 'build_dashboard',
    label: 'Build a Dashboard',
    why: 'Arrange Insights and Inputs into a single page.',
    href: '/editor',
  },
  {
    id: 'view_project',
    label: 'View your Project',
    why: 'See the dashboard your code produces.',
    href: '/project',
  },
  {
    id: 'deploy',
    label: 'Deploy to share',
    why: 'Run visivo deploy to push to cloud.',
    href: '/editor',
  },
];

const CHECKLIST_WIDTH = 320;
const VIEWPORT_PAD = 8;

function readDismissed() {
  const s = readOnboardingState();
  return !!(s && s.checklist_dismissed);
}

function readCheckedFromState(s) {
  return new Set(s?.checklist_checked || []);
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
  const project = useStore(s => s.project);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(readDismissed());
  const state = readOnboardingState() || {};
  const [checked, setChecked] = useState(() => readCheckedFromState(state));

  const cardRef = useRef(null);
  const dragStateRef = useRef(null);
  const [position, setPosition] = useState(() => readPersistedPosition());
  const [isDragging, setIsDragging] = useState(false);

  const dashboards = project?.project_json?.dashboards || [];
  const sources = project?.project_json?.sources || [];
  const sourceConnectedSignal = state.source_connected || sources.length > 0;
  const hasDashboard = dashboards.length > 0 || state.path === 'sample';

  const items = useMemo(() => {
    return ITEMS.map(it => {
      let satisfied = checked.has(it.id);
      if (it.id === 'connect_source' && sourceConnectedSignal) satisfied = true;
      if (it.id === 'view_project' && hasDashboard) satisfied = true;
      if (it.id === 'build_dashboard' && hasDashboard) satisfied = true;
      return { ...it, done: satisfied };
    });
  }, [checked, sourceConnectedSignal, hasDashboard]);

  const completed = items.filter(i => i.done).length;
  const total = items.length;

  useEffect(() => {
    if (!dismissed && !state.checklist_seen_emitted) {
      fireEvent('onboarding_checklist_shown');
      writeOnboardingState({ ...readOnboardingState(), checklist_seen_emitted: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const persisted = readOnboardingState() || {};
    const persistedChecked = new Set(persisted.checklist_checked || []);
    let changed = false;
    items.forEach(it => {
      if (it.done && !persistedChecked.has(it.id)) {
        fireEvent('onboarding_checklist_item_satisfied', {
          item_id: it.id,
          satisfied_via: checked.has(it.id) ? 'click_through' : 'background_signal',
        });
        persistedChecked.add(it.id);
        changed = true;
      }
    });
    if (changed) {
      writeOnboardingState({
        ...persisted,
        checklist_checked: Array.from(persistedChecked),
      });
      setChecked(new Set(persistedChecked));
    }
    if (completed === total && !persisted.checklist_completed_emitted) {
      fireEvent('onboarding_checklist_completed');
      writeOnboardingState({
        ...readOnboardingState(),
        checklist_completed_emitted: true,
      });
    }
  }, [items, completed, total, checked]);

  // Re-clamp the saved position when the viewport changes so the card
  // doesn't end up off-screen after a window resize.
  useEffect(() => {
    if (!position) return;
    const onResize = () => {
      const h = cardRef.current?.offsetHeight || 0;
      setPosition(p => (p ? clampToViewport(p.top, p.left, h) : p));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [position]);

  const handleHeaderPointerDown = useCallback(
    e => {
      // Allow the chevron / progress ring to still toggle collapse —
      // any explicit interactive child wins over the drag handle.
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
    },
    []
  );

  const handleHeaderPointerMove = useCallback(
    e => {
      const ds = dragStateRef.current;
      if (!ds) return;
      const top = e.clientY - ds.offsetY;
      const left = e.clientX - ds.offsetX;
      ds.movedPx = Math.max(
        ds.movedPx,
        Math.abs(e.clientX - ds.startX) + Math.abs(e.clientY - ds.startY)
      );
      const clamped = clampToViewport(top, left, ds.cardHeight);
      setPosition(clamped);
    },
    []
  );

  const handleHeaderPointerUp = useCallback(
    e => {
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
        // Treat as a header click: toggle collapsed state.
        setCollapsed(c => !c);
      }
    },
    []
  );

  if (dismissed) return null;
  if (!hasCompletedOnboarding()) return null;
  if (completed === total) {
    return null;
  }

  const handleItemClick = it => {
    if (it.done) return;
    fireEvent('onboarding_checklist_item_clicked', { item_id: it.id });
    navigate(it.href);
  };

  const handleDismiss = e => {
    e.stopPropagation();
    fireEvent('onboarding_checklist_dismissed');
    writeOnboardingState({ ...readOnboardingState(), checklist_dismissed: true });
    setDismissed(true);
  };

  const pct = Math.round((completed / total) * 100);
  const dashLen = (completed / total) * 88;

  // When the user has dragged the card we anchor by absolute top/left.
  // Until then we keep the default top-right anchor from the stylesheet.
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
                  className={`onb-checklist__check ${
                    it.done ? 'onb-checklist__check--done' : ''
                  }`}
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
