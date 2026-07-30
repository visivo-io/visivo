import React from 'react';
import useStore from '../../../stores/store';
import { HIGHER_LEVEL_VIEWS } from './higherLevelViews';
import { getTypeIcon, getTypeColors } from '../common/objectTypeConfigs';
import { emitWorkspaceEvent } from './telemetry';

/**
 * ViewSwitcher — the workspace's DESTINATION switcher (D1, Explore 2.0 Phase
 * 0), pinned atop the LeftRail (01-ux-spec.md §1), replacing the Library's old
 * "surface buttons" row (`library-surface-project/explorer/semantic-layer`).
 *
 * Three rows: Project · Semantic Layer · Explorer — icon + label + active
 * indicator, sourced from `higherLevelViews.js` (icon/color resolve through
 * `objectTypeConfigs.js`, matching every other type-driven surface). Renders a
 * compact icon strip when the Library itself is collapsed (`collapsed` prop),
 * fixed positions with tooltips, per the spec.
 *
 * Semantics: clicking a row activates that view (`openWorkspaceView`) — the
 * write path parks any active document tab (it stays open in the strip, just
 * unfocused) rather than closing it. The active indicator only lights up while
 * a view actually OWNS the center — i.e. no document tab is active — per
 * 01-ux-spec.md §1 ("clicking any document tab re-takes the center... shows no
 * active indicator while a tab owns the center").
 *
 * Views have no ✕, no dirty dot, no drag (they aren't tab records).
 */
const ViewSwitcher = ({ collapsed = false }) => {
  const activeView = useStore(s => s.workspaceActiveView);
  const activeTabId = useStore(s => s.workspaceActiveTabId);
  const openWorkspaceView = useStore(s => s.openWorkspaceView);

  const showActive = !activeTabId;

  const handleSelect = key => {
    emitWorkspaceEvent('view_switcher_selected', { view: key });
    if (openWorkspaceView) openWorkspaceView(key);
  };

  if (collapsed) {
    return (
      <nav
        aria-label="Workspace views"
        data-testid="workspace-view-switcher"
        data-collapsed="true"
        className="flex flex-col items-center gap-1 border-b border-gray-200 py-2"
      >
        {HIGHER_LEVEL_VIEWS.map(view => {
          const Icon = getTypeIcon(view.key);
          const colors = getTypeColors(view.key);
          const active = showActive && activeView === view.key;
          return (
            <button
              key={view.key}
              type="button"
              title={view.label}
              aria-label={view.label}
              aria-current={active ? 'true' : undefined}
              onClick={() => handleSelect(view.key)}
              data-testid={`workspace-view-switcher-${view.key}`}
              data-active={active ? 'true' : 'false'}
              className={[
                'inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors',
                active
                  ? `${colors.bg} ${colors.text}`
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
              ].join(' ')}
            >
              {Icon && <Icon aria-hidden="true" style={{ fontSize: 18 }} />}
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Workspace views"
      data-testid="workspace-view-switcher"
      data-collapsed="false"
      className="flex shrink-0 flex-col gap-0.5 border-b border-gray-200 px-2 py-2"
    >
      {HIGHER_LEVEL_VIEWS.map(view => {
        const Icon = getTypeIcon(view.key);
        const colors = getTypeColors(view.key);
        const active = showActive && activeView === view.key;
        return (
          <button
            key={view.key}
            type="button"
            title={view.label}
            aria-current={active ? 'true' : undefined}
            onClick={() => handleSelect(view.key)}
            data-testid={`workspace-view-switcher-${view.key}`}
            data-active={active ? 'true' : 'false'}
            className={[
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] font-medium transition-colors',
              active
                ? `${colors.bg} ${colors.text}`
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
            ].join(' ')}
          >
            {Icon && <Icon aria-hidden="true" style={{ fontSize: 15 }} className="shrink-0" />}
            <span className="truncate">{view.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default ViewSwitcher;
