/**
 * LibraryRow behaviour (VIS-769 + VIS-776 / Track C C1 + C3).
 *
 * Covers:
 *   - row click delegation
 *   - hover-revealed flip + ⋯ actions
 *   - draggable wiring (registers a draggable id with the dnd-kit
 *     manager so the canvas drop target in Track D can consume it)
 *   - right-click context menu (with "Wrap in Chart…" for insights)
 *   - flip icon click opens the popover
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DndContext, useDraggable } from '@dnd-kit/core';
import LibraryRow, { getTypeDef } from './LibraryRow';
import { getTypeByValue, getTypeIcon } from '../../common/objectTypeConfigs';

// Wrap the real dnd-kit so existing tests keep their real draggable wiring,
// while individual tests can override useDraggable (e.g. to simulate mid-drag).
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return { __esModule: true, ...actual, useDraggable: jest.fn(actual.useDraggable) };
});

const withDnd = (ui) => <DndContext>{ui}</DndContext>;

const CHART = { id: 'chart:waterfall', type: 'chart', name: 'waterfall' };
const INSIGHT = {
  id: 'insight:revenue_growth',
  type: 'insight',
  name: 'revenue_growth',
};
const MODEL = { id: 'model:monthly_revenue', type: 'model', name: 'monthly_revenue' };

describe('LibraryRow', () => {
  test('getTypeDef covers every C-1 leaf type with the right droppable flag', () => {
    ['chart', 'table', 'markdown', 'input'].forEach((t) => {
      const def = getTypeDef(t);
      expect(def).toBeTruthy();
      expect(def.droppable).toBe(true);
      expect(def.accent).toBe('mulberry');
    });
    ['source', 'model', 'dimension', 'metric', 'relation', 'insight'].forEach((t) => {
      const def = getTypeDef(t);
      expect(def).toBeTruthy();
      expect(def.droppable).toBe(false);
      expect(def.accent).toBe('teal');
    });
    // Dashboards (VIS-824) sit in the Layout Items section but are NOT
    // canvas-droppable — clicking one scopes the middle pane instead.
    const dashboardDef = getTypeDef('dashboard');
    expect(dashboardDef).toBeTruthy();
    expect(dashboardDef.droppable).toBe(false);
  });

  test('getTypeDef falls back to a bare icon/label/pluralization for a type with no objectTypeConfigs entry', () => {
    const def = getTypeDef('totally_unknown_type');
    expect(def.label).toBe('totally_unknown_type');
    expect(def.plural).toBe('totally_unknown_types');
    expect(def.icon).toBeTruthy();
  });

  // Explore 2.0 Phase 3a (D9 / 02-architecture.md §4): source/metric/
  // dimension/insight are exploration drag sources (SQL editor, prop slots,
  // interactions, the chart insight zone) even though they are NOT
  // canvas-droppable dashboard items — kept independent of `droppable` so
  // the dashboard canvas-insert path (WorkspaceDndContext) can still reject
  // them.
  test('getTypeDef flags source/metric/dimension/insight as exploration drag sources, independent of droppable', () => {
    ['source', 'metric', 'dimension', 'insight'].forEach(t => {
      const def = getTypeDef(t);
      expect(def.explorationDragSource).toBe(true);
      expect(def.droppable).toBe(false); // unchanged — not a canvas item
    });
    ['model', 'relation'].forEach(t => {
      expect(getTypeDef(t).explorationDragSource).toBe(false);
    });
    ['chart', 'table', 'markdown', 'input'].forEach(t => {
      // Already draggable via `droppable` — explorationDragSource is simply
      // not needed for these (LibrarySubsection ORs the two flags).
      expect(getTypeDef(t).explorationDragSource).toBe(false);
      expect(getTypeDef(t).droppable).toBe(true);
    });
  });

  test('getTypeDef derives icon + label + plural from the canonical objectTypeConfigs', () => {
    // The Library must not fork per-type metadata — every type's icon, label
    // and plural come from the app-wide canonical `objectTypeConfigs.js` so
    // Library rows match /editor, lineage nodes, the explorer, and pills.
    [
      'chart',
      'table',
      'markdown',
      'input',
      'source',
      'model',
      'dimension',
      'metric',
      'relation',
      'insight',
    ].forEach((t) => {
      const def = getTypeDef(t);
      const cfg = getTypeByValue(t);
      expect(def.icon).toBe(getTypeIcon(t));
      expect(def.label).toBe(cfg.singularLabel);
      expect(def.plural).toBe(cfg.label);
    });
  });

  test('renders the type icon and name and forwards click', () => {
    const onClick = jest.fn();
    render(withDnd(<LibraryRow obj={CHART} onClick={onClick} />));
    const row = screen.getByTestId('library-row-chart-waterfall');
    expect(row).toHaveTextContent('waterfall');
    fireEvent.click(row);
    expect(onClick).toHaveBeenCalledWith(CHART, expect.anything());
  });

  test('Enter/Space on the focused row also forwards click (keyboard accessibility)', () => {
    const onClick = jest.fn();
    render(withDnd(<LibraryRow obj={CHART} onClick={onClick} />));
    const row = screen.getByTestId('library-row-chart-waterfall');
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(row, { key: 'Tab' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  test('StatusDot: renders nothing for a published/no-status object, green for new, amber for modified', () => {
    const { rerender } = render(withDnd(<LibraryRow obj={{ ...CHART, status: 'published' }} />));
    expect(screen.queryByTestId('library-row-status-dot')).not.toBeInTheDocument();

    rerender(withDnd(<LibraryRow obj={{ ...CHART, status: 'new' }} />));
    const newDot = screen.getByTestId('library-row-status-dot');
    expect(newDot).toHaveClass('bg-green-500');
    expect(newDot).toHaveAttribute('title', 'New — not yet published');

    rerender(withDnd(<LibraryRow obj={{ ...CHART, status: 'modified' }} />));
    const modifiedDot = screen.getByTestId('library-row-status-dot');
    expect(modifiedDot).toHaveClass('bg-amber-500');
    expect(modifiedDot).toHaveAttribute('title', 'Modified — has unpublished changes');
  });

  test('mouseLeave un-hovers the row (actions hide again)', () => {
    render(withDnd(<LibraryRow obj={INSIGHT} />));
    const row = screen.getByTestId('library-row-insight-revenue_growth');
    fireEvent.mouseEnter(row);
    expect(row).toHaveAttribute('data-hovered', 'true');
    fireEvent.mouseLeave(row);
    expect(row).toHaveAttribute('data-hovered', 'false');
  });

  test('a mousedown on a context-menu item does not lose row focus, and a mousedown INSIDE the menu never dismisses it', () => {
    render(withDnd(<LibraryRow obj={INSIGHT} />));
    const row = screen.getByTestId('library-row-insight-revenue_growth');
    fireEvent.mouseEnter(row);
    fireEvent.click(screen.getByTestId('library-row-insight-revenue_growth-kebab'));
    const menu = screen.getByTestId('library-row-insight-revenue_growth-context-menu');
    expect(menu).toBeInTheDocument();

    // A real cursor click fires mousedown before click — the item's own
    // onMouseDown must preventDefault (never lose focus) and the doc-level
    // outside-click guard must see the target is INSIDE the menu and leave
    // it open.
    const menuItem = within(menu).getByText('Show lineage');
    fireEvent.mouseDown(menuItem);
    expect(screen.getByTestId('library-row-insight-revenue_growth-context-menu')).toBeInTheDocument();
  });

  test('a mousedown OUTSIDE the menu dismisses it', () => {
    render(withDnd(<LibraryRow obj={INSIGHT} />));
    fireEvent.mouseEnter(screen.getByTestId('library-row-insight-revenue_growth'));
    fireEvent.click(screen.getByTestId('library-row-insight-revenue_growth-kebab'));
    expect(screen.getByTestId('library-row-insight-revenue_growth-context-menu')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(
      screen.queryByTestId('library-row-insight-revenue_growth-context-menu')
    ).not.toBeInTheDocument();
  });

  test('reveals flip + ⋯ actions on hover and the kebab opens a context menu', () => {
    render(withDnd(<LibraryRow obj={INSIGHT} />));
    const row = screen.getByTestId('library-row-insight-revenue_growth');
    fireEvent.mouseEnter(row);
    expect(screen.getByTestId('library-row-insight-revenue_growth-flip')).toBeInTheDocument();
    expect(screen.getByTestId('library-row-insight-revenue_growth-kebab')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('library-row-insight-revenue_growth-kebab'));
    expect(
      screen.getByTestId('library-row-insight-revenue_growth-context-menu')
    ).toBeInTheDocument();
  });

  test('insight context menu includes "Wrap in Chart…"', () => {
    render(withDnd(<LibraryRow obj={INSIGHT} />));
    fireEvent.mouseEnter(screen.getByTestId('library-row-insight-revenue_growth'));
    fireEvent.click(screen.getByTestId('library-row-insight-revenue_growth-kebab'));
    expect(
      screen.getByTestId('library-row-insight-revenue_growth-context-menu')
    ).toHaveTextContent('Wrap in Chart…');
  });

  test('model context menu does NOT include "Wrap in Chart…"', () => {
    render(withDnd(<LibraryRow obj={MODEL} />));
    fireEvent.mouseEnter(screen.getByTestId('library-row-model-monthly_revenue'));
    fireEvent.click(screen.getByTestId('library-row-model-monthly_revenue-kebab'));
    expect(
      screen.getByTestId('library-row-model-monthly_revenue-context-menu')
    ).not.toHaveTextContent('Wrap in Chart');
  });

  test('context menu carries Show-lineage + Delete (no redundant open items), with kbd hints', () => {
    render(withDnd(<LibraryRow obj={MODEL} />));
    fireEvent.mouseEnter(screen.getByTestId('library-row-model-monthly_revenue'));
    fireEvent.click(screen.getByTestId('library-row-model-monthly_revenue-kebab'));
    const menu = screen.getByTestId('library-row-model-monthly_revenue-context-menu');
    // "Open in right rail" / "Open in new tab" removed — clicking the row
    // already opens it, so those items only duplicated the click.
    expect(menu).not.toHaveTextContent('Open in right rail');
    expect(menu).not.toHaveTextContent('Open in new tab');
    expect(menu).toHaveTextContent('Show lineage');
    expect(menu).toHaveTextContent('Delete…');
    // Remaining keyboard hints — the design's discoverability cue.
    expect(menu).toHaveTextContent('F'); // Show lineage
    expect(menu).toHaveTextContent('⌫'); // Delete
  });

  // VIS-1067 — "Explore this" / "Add to exploration" context-menu entries.
  describe('Explore this / Add to exploration (VIS-1067)', () => {
    test('a model row offers "Explore this" but never "Add to exploration" (model is not an EXPLORATION_DRAG_TYPE)', () => {
      render(withDnd(<LibraryRow obj={MODEL} canAddToExploration />));
      fireEvent.mouseEnter(screen.getByTestId('library-row-model-monthly_revenue'));
      fireEvent.click(screen.getByTestId('library-row-model-monthly_revenue-kebab'));
      const menu = screen.getByTestId('library-row-model-monthly_revenue-context-menu');
      expect(menu).toHaveTextContent('Explore this');
      expect(menu).not.toHaveTextContent('Add to exploration');
    });

    test('an insight row offers "Add to exploration" only when canAddToExploration is true', () => {
      const { rerender } = render(withDnd(<LibraryRow obj={INSIGHT} canAddToExploration={false} />));
      fireEvent.mouseEnter(screen.getByTestId('library-row-insight-revenue_growth'));
      fireEvent.click(screen.getByTestId('library-row-insight-revenue_growth-kebab'));
      expect(
        screen.getByTestId('library-row-insight-revenue_growth-context-menu')
      ).not.toHaveTextContent('Add to exploration');

      // Re-render with the flag flipped WITHOUT re-toggling the kebab — the
      // menu (internal `menuOpen` state) stays open across the prop change,
      // clicking the kebab again would just close it.
      rerender(withDnd(<LibraryRow obj={INSIGHT} canAddToExploration />));
      expect(
        screen.getByTestId('library-row-insight-revenue_growth-context-menu')
      ).toHaveTextContent('Add to exploration');
    });

    test('"Explore this" fires onContextAction("exploreThis", obj) and dismisses the menu', () => {
      const onContextAction = jest.fn();
      render(withDnd(<LibraryRow obj={INSIGHT} onContextAction={onContextAction} />));
      fireEvent.mouseEnter(screen.getByTestId('library-row-insight-revenue_growth'));
      fireEvent.click(screen.getByTestId('library-row-insight-revenue_growth-kebab'));
      fireEvent.click(screen.getByText('Explore this'));
      expect(onContextAction).toHaveBeenCalledWith('exploreThis', INSIGHT);
      expect(
        screen.queryByTestId('library-row-insight-revenue_growth-context-menu')
      ).not.toBeInTheDocument();
    });

    test('"Add to exploration" fires onContextAction("addToExploration", obj)', () => {
      const onContextAction = jest.fn();
      render(
        withDnd(
          <LibraryRow obj={INSIGHT} canAddToExploration onContextAction={onContextAction} />
        )
      );
      fireEvent.mouseEnter(screen.getByTestId('library-row-insight-revenue_growth'));
      fireEvent.click(screen.getByTestId('library-row-insight-revenue_growth-kebab'));
      fireEvent.click(screen.getByText('Add to exploration'));
      expect(onContextAction).toHaveBeenCalledWith('addToExploration', INSIGHT);
    });
  });

  // Phase 6c-T5 (ux-audit.md "'Explore this' is discoverable only via
  // right-click/kebab in the Library tree — give it a visible affordance").
  describe('visible "Explore" button (Phase 6c-T5)', () => {
    test('a hover-revealed Explore button exists for an EXPLORE_THIS_TYPE row — no right-click/kebab needed', () => {
      const onContextAction = jest.fn();
      render(withDnd(<LibraryRow obj={INSIGHT} onContextAction={onContextAction} />));
      fireEvent.mouseEnter(screen.getByTestId('library-row-insight-revenue_growth'));
      const exploreButton = screen.getByTestId('library-row-insight-revenue_growth-explore');
      expect(exploreButton).toBeInTheDocument();
      fireEvent.click(exploreButton);
      expect(onContextAction).toHaveBeenCalledWith('exploreThis', INSIGHT);
      // Never opened the kebab's dropdown menu — this is a direct, one-click
      // affordance, not a menu item.
      expect(
        screen.queryByTestId('library-row-insight-revenue_growth-context-menu')
      ).not.toBeInTheDocument();
    });

    test('a model row also gets the visible Explore button', () => {
      render(withDnd(<LibraryRow obj={MODEL} />));
      fireEvent.mouseEnter(screen.getByTestId('library-row-model-monthly_revenue'));
      expect(screen.getByTestId('library-row-model-monthly_revenue-explore')).toBeInTheDocument();
    });

    test('a type outside EXPLORE_THIS_TYPES (e.g. dashboard) gets no Explore button', () => {
      const DASHBOARD = { type: 'dashboard', name: 'kpis' };
      render(withDnd(<LibraryRow obj={DASHBOARD} />));
      fireEvent.mouseEnter(screen.getByTestId('library-row-dashboard-kpis'));
      expect(screen.queryByTestId('library-row-dashboard-kpis-explore')).not.toBeInTheDocument();
    });
  });

  test('right-click opens the context menu (preventing the native one)', () => {
    render(withDnd(<LibraryRow obj={CHART} />));
    const row = screen.getByTestId('library-row-chart-waterfall');
    // jsdom doesn't preventDefault for contextmenu by default — we just
    // assert the menu mounts.
    fireEvent.contextMenu(row);
    expect(
      screen.getByTestId('library-row-chart-waterfall-context-menu')
    ).toBeInTheDocument();
  });

  test('flip click toggles the lineage popover', () => {
    render(withDnd(<LibraryRow obj={CHART} />));
    const row = screen.getByTestId('library-row-chart-waterfall');
    fireEvent.mouseEnter(row);
    const flip = screen.getByTestId('library-row-chart-waterfall-flip');
    fireEvent.click(flip);
    expect(
      screen.getByTestId('library-row-chart-waterfall-popover')
    ).toBeInTheDocument();
    // Clicking flip again closes it.
    fireEvent.click(flip);
    expect(
      screen.queryByTestId('library-row-chart-waterfall-popover')
    ).not.toBeInTheDocument();
  });

  test('selected row shows the active styling + bold name', () => {
    render(withDnd(<LibraryRow obj={CHART} selected />));
    const row = screen.getByTestId('library-row-chart-waterfall');
    expect(row).toHaveAttribute('data-selected', 'true');
  });

  // VIS-1135. Icon colour is the selection signal. Before this, every
  // LibraryRow icon was `text-gray-500` regardless of state and only the
  // source row was permanently type-coloured — so colour told you nothing
  // about what was selected. These assert the rule at the row level; the
  // colours themselves come from objectTypeConfigs (chart=pink, model=amber)
  // and are pinned by objectTypeConfigs.test.js.
  test('a selected row paints its icon in the type colour', () => {
    render(withDnd(<LibraryRow obj={CHART} selected />));
    expect(screen.getByTestId('library-row-chart-waterfall-icon')).toHaveClass(
      getTypeByValue('chart').colors.text
    );
  });

  test('an unselected row paints its icon gray, whatever its type', () => {
    render(withDnd(<LibraryRow obj={CHART} />));
    const icon = screen.getByTestId('library-row-chart-waterfall-icon');
    expect(icon).toHaveClass('text-gray-500');
    expect(icon).not.toHaveClass(getTypeByValue('chart').colors.text);
  });

  test('the type colour follows the type, not a single accent', () => {
    // Guards against "selected" being wired to one hard-coded colour: a
    // selected model must be amber, not the chart's pink.
    render(withDnd(<LibraryRow obj={MODEL} selected />));
    expect(screen.getByTestId('library-row-model-monthly_revenue-icon')).toHaveClass(
      getTypeByValue('model').colors.text
    );
  });

  test('an unknown type still gets a gray icon rather than crashing', () => {
    // getTypeDef falls back to DEFAULT_COLORS, so `def.colors.text` is always
    // defined — this is the guard on that fallback being reachable.
    const odd = { id: 'weird:thing', type: 'weird', name: 'thing' };
    render(withDnd(<LibraryRow obj={odd} />));
    expect(screen.getByTestId('library-row-weird-thing-icon')).toHaveClass('text-gray-500');
  });

  // VIS-1134: the disclosure contract LibrarySourceRow composes with.
  describe('expand contract', () => {
    test('no caret and no wrapper markup unless expandable is set', () => {
      render(withDnd(<LibraryRow obj={CHART} />));
      expect(
        screen.queryByTestId('library-row-chart-waterfall-toggle')
      ).not.toBeInTheDocument();
    });

    test('the caret renders when expandable, and reports its state', () => {
      const onToggleExpand = jest.fn();
      render(
        withDnd(<LibraryRow obj={CHART} expandable expanded={false} onToggleExpand={onToggleExpand} />)
      );
      const caret = screen.getByTestId('library-row-chart-waterfall-toggle');
      expect(caret).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(caret);
      expect(onToggleExpand).toHaveBeenCalled();
    });

    test('the caret shows even with no children — collapsed IS the lazy state', () => {
      // `expandable` is deliberately explicit rather than inferred from
      // `children`: the drill-down is falsy until expanded (mounting it is
      // what fetches), so inferring would hide the caret exactly when it is
      // needed to expand.
      render(withDnd(<LibraryRow obj={CHART} expandable expanded={false} />));
      expect(screen.getByTestId('library-row-chart-waterfall-toggle')).toBeInTheDocument();
    });

    test('children render OUTSIDE the row anchor, so the context menu is not pushed below them', () => {
      // ContextMenu is `absolute top-full` on the anchor div. If children were
      // nested inside it, opening the menu on an expanded row would drop it
      // below the whole expanded tree.
      render(
        withDnd(
          <LibraryRow obj={CHART} expandable expanded>
            <div data-testid="drilldown-body">tables</div>
          </LibraryRow>
        )
      );
      expect(screen.getByTestId('drilldown-body')).toBeInTheDocument();
      // The body renders, but NOT inside the anchor the menu is positioned
      // against — that is the whole point.
      const anchor = screen.getByTestId('library-row-chart-waterfall-anchor');
      expect(within(anchor).queryByTestId('drilldown-body')).not.toBeInTheDocument();
      expect(within(anchor).getByTestId('library-row-chart-waterfall')).toBeInTheDocument();
    });
  });

  test('non-droppable rows do not expose the drag handle dots', () => {
    render(withDnd(<LibraryRow obj={MODEL} draggable={false} />));
    expect(
      screen.queryByTestId('library-row-model-monthly_revenue-drag-handle')
    ).not.toBeInTheDocument();
  });

  test('draggable rows render the drag handle (hover-revealed)', () => {
    render(withDnd(<LibraryRow obj={CHART} draggable />));
    expect(
      screen.getByTestId('library-row-chart-waterfall-drag-handle')
    ).toBeInTheDocument();
  });

  // Explore 2.0 Phase 3a payload extension (02-architecture.md §4): the
  // drop side (WorkspaceDndContext) needs parentModel/expression/inputType
  // on the drag payload to resolve ref scoping and input accessors.
  test('drag payload carries parentModel/expression/inputType when the row has them', () => {
    useDraggable.mockClear();
    const METRIC = {
      id: 'metric:churn_rate',
      type: 'metric',
      name: 'churn_rate',
      parentModel: 'orders_q',
      expression: 'sum(churned) / count(*)',
    };
    render(withDnd(<LibraryRow obj={METRIC} draggable />));
    const call = useDraggable.mock.calls.find(([opts]) => opts.id === 'library:metric:churn_rate');
    expect(call[0].data).toEqual(
      expect.objectContaining({
        source: 'library',
        type: 'metric',
        name: 'churn_rate',
        parentModel: 'orders_q',
        expression: 'sum(churned) / count(*)',
      })
    );
  });

  test('drag payload carries inputType for input rows', () => {
    useDraggable.mockClear();
    const INPUT = { id: 'input:region', type: 'input', name: 'region', inputType: 'multi-select' };
    render(withDnd(<LibraryRow obj={INPUT} draggable />));
    const call = useDraggable.mock.calls.find(([opts]) => opts.id === 'library:input:region');
    expect(call[0].data.inputType).toBe('multi-select');
  });

  // VIS-836: the source row must NOT translate with the cursor during a drag —
  // the shared <DragOverlay> renders the preview. Translating the source slid it
  // right, grew the Library rail's scroll width, and let dnd-kit auto-scroll the
  // rail horizontally until it went blank.
  test('draggable source row does not apply a translate transform while dragging', () => {
    useDraggable.mockReturnValueOnce({
      transform: { x: 180, y: 12, scaleX: 1, scaleY: 1 },
      setNodeRef: jest.fn(),
      listeners: {},
      attributes: {},
      isDragging: true,
    });
    render(withDnd(<LibraryRow obj={CHART} draggable />));
    const row = screen.getByTestId('library-row-chart-waterfall');
    expect(row.style.transform || '').not.toMatch(/translate/);
  });

  test('a click never fires onClick while a drag is in progress (isDragging)', () => {
    useDraggable.mockReturnValueOnce({
      transform: null,
      setNodeRef: jest.fn(),
      listeners: {},
      attributes: {},
      isDragging: true,
    });
    const onClick = jest.fn();
    render(withDnd(<LibraryRow obj={CHART} draggable onClick={onClick} />));
    fireEvent.click(screen.getByTestId('library-row-chart-waterfall'));
    expect(onClick).not.toHaveBeenCalled();
  });
});


// `list_all_dimensions` / `list_all_metrics` return standalone AND nested
// fields in ONE flat list, and these rows rendered them identically. The
// distinction is not cosmetic: a nested field is plain SQL where `${ref()}` is
// a hard save-time error, while a standalone one is authored WITH refs. Two
// things that look the same and behave differently is the worst combination.
describe('LibraryRow — model-scoped marker', () => {
  const scoped = { type: 'dimension', name: 'gdp2', parentModel: 'new-model', status: 'published' };
  const standalone = { type: 'dimension', name: 'region', status: 'published' };

  test('a model-scoped field names the model that owns it', () => {
    render(withDnd(<LibraryRow obj={scoped} />));
    const marker = screen.getByTestId('library-row-dimension-gdp2-scoped-to');
    expect(marker).toHaveTextContent('new-model');
  });

  test('the marker explains what scoping COSTS, not just that it exists', () => {
    render(withDnd(<LibraryRow obj={scoped} />));
    // The reason a user cares: refs are unavailable in that field.
    expect(screen.getByTestId('library-row-dimension-gdp2-scoped-to')).toHaveAttribute(
      'title',
      expect.stringContaining("ref() isn't available")
    );
  });

  test('a standalone field carries no marker', () => {
    render(withDnd(<LibraryRow obj={standalone} />));
    expect(screen.queryByTestId('library-row-dimension-region-scoped-to')).not.toBeInTheDocument();
  });

  test('the two are distinguishable in the same list', () => {
    const { rerender } = render(withDnd(<LibraryRow obj={scoped} />));
    expect(screen.getByTestId('library-row-dimension-gdp2-scoped-to')).toBeInTheDocument();
    rerender(withDnd(<LibraryRow obj={standalone} />));
    expect(screen.queryByTestId('library-row-dimension-region-scoped-to')).not.toBeInTheDocument();
  });
});
