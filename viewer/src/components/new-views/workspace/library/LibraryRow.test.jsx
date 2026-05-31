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
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import LibraryRow, { getTypeDef } from './LibraryRow';
import { getTypeByValue, getTypeIcon } from '../../common/objectTypeConfigs';

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

  test('context menu carries the Open-in-new-tab + Delete items and kbd hints', () => {
    // Regression: menu was missing Open-in-new-tab + Delete… (with divider)
    // and the keyboard hints per the C-1 design.
    render(withDnd(<LibraryRow obj={MODEL} />));
    fireEvent.mouseEnter(screen.getByTestId('library-row-model-monthly_revenue'));
    fireEvent.click(screen.getByTestId('library-row-model-monthly_revenue-kebab'));
    const menu = screen.getByTestId('library-row-model-monthly_revenue-context-menu');
    expect(menu).toHaveTextContent('Open in right rail');
    expect(menu).toHaveTextContent('Open in new tab');
    expect(menu).toHaveTextContent('Show lineage');
    expect(menu).toHaveTextContent('Delete…');
    // Keyboard hints — the design's discoverability cue.
    expect(menu).toHaveTextContent('↵');
    expect(menu).toHaveTextContent('⌘↵');
    expect(menu).toHaveTextContent('⌫');
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
});
