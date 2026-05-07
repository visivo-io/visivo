import React, { useEffect, useMemo, useState } from 'react';
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

function readDismissed() {
  const s = readOnboardingState();
  return !!(s && s.checklist_dismissed);
}

function readCheckedFromState(s) {
  return new Set(s?.checklist_checked || []);
}

export default function OnboardingChecklist() {
  const navigate = useNavigate();
  const project = useStore(s => s.project);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(readDismissed());
  const state = readOnboardingState() || {};
  const [checked, setChecked] = useState(() => readCheckedFromState(state));

  const dashboards = project?.project_json?.dashboards || [];
  const sources = project?.project_json?.sources || [];
  const sourceConnectedSignal = state.source_connected || sources.length > 0;
  const hasDashboard = dashboards.length > 0 || state.path === 'sample';

  // Compute "satisfied" from real backend state + flow outcome
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

  // Fire shown once
  useEffect(() => {
    if (!dismissed && !state.checklist_seen_emitted) {
      fireEvent('onboarding_checklist_shown');
      writeOnboardingState({ ...readOnboardingState(), checklist_seen_emitted: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist newly-satisfied items so we emit `_satisfied` events once each
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

  if (dismissed) return null;
  if (!hasCompletedOnboarding()) return null;
  if (completed === total) {
    // auto-dismiss after a moment when everything's done
    return null;
  }

  const handleClick = it => {
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

  return (
    <div className="onb-checklist" data-testid="onboarding-checklist">
      <div className="onb-checklist__card">
        <div
          className={`onb-checklist__head ${collapsed ? '' : 'onb-checklist__head--bordered'}`}
          onClick={() => setCollapsed(c => !c)}
          role="button"
          tabIndex={0}
        >
          <div>
            <div className="onb-checklist__title">Get started with Visivo</div>
            <div className="onb-checklist__sub">
              {completed} of {total} complete
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
              <button
                key={it.id}
                type="button"
                className="onb-checklist__item"
                onClick={() => handleClick(it)}
                disabled={it.done}
                title={it.why}
                data-testid={`onb-checklist-${it.id}`}
              >
                <div className={`onb-checklist__check ${it.done ? 'onb-checklist__check--done' : ''}`}>
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
              </button>
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
