/**
 * ExplorationQueryChips — Explore 2.0 Phase 3a (01-ux-spec.md §3).
 *
 * Covers create/switch/rename/no-duplicate-names/delete(-with-dependents) —
 * the query-chip CRUD ledger resolution (05-e2e-ledger.md orchestrator
 * resolution #3), plus the run-status dot and referenced-by badge.
 */
/* eslint-disable no-template-curly-in-string -- fixtures use literal Visivo ref-string syntax, not JS template interpolation */
import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import useStore from '../../../stores/store';
import ExplorationQueryChips from './ExplorationQueryChips';

const resetStore = () => {
  act(() => {
    useStore.setState({
      explorerModelTabs: [],
      explorerActiveModelName: null,
      explorerModelStates: {},
      explorerChartInsightNames: [],
      explorerInsightStates: {},
    });
  });
};

describe('ExplorationQueryChips', () => {
  beforeEach(resetStore);

  test('renders a chip per query tab, with the active one flagged', () => {
    act(() => {
      useStore.getState().createModelTab('orders_q');
      useStore.getState().createModelTab('cohort_q');
    });
    render(<ExplorationQueryChips />);
    expect(screen.getByTestId('query-chip-orders_q')).toHaveAttribute('data-active', 'false');
    expect(screen.getByTestId('query-chip-cohort_q')).toHaveAttribute('data-active', 'true');
  });

  test('[+] creates a new, auto-named query chip and activates it', () => {
    render(<ExplorationQueryChips />);
    expect(screen.queryByTestId(/^query-chip-model/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('query-chip-add'));
    expect(useStore.getState().explorerModelTabs).toHaveLength(1);
    const name = useStore.getState().explorerModelTabs[0];
    expect(screen.getByTestId(`query-chip-${name}`)).toHaveAttribute('data-active', 'true');
  });

  test('clicking an inactive chip switches to it', () => {
    act(() => {
      useStore.getState().createModelTab('orders_q');
      useStore.getState().createModelTab('cohort_q');
    });
    render(<ExplorationQueryChips />);
    fireEvent.click(screen.getByTestId('query-chip-orders_q'));
    expect(useStore.getState().explorerActiveModelName).toBe('orders_q');
  });

  test('the run-status dot reflects queryResult/queryError/not-yet-run', () => {
    act(() => {
      useStore.getState().createModelTab('orders_q');
      useStore.getState().setModelQueryResult('orders_q', { rows: [], columns: [] });
      useStore.getState().createModelTab('cohort_q');
      useStore.getState().setModelQueryError('cohort_q', 'boom');
      useStore.getState().createModelTab('never_run_q');
    });
    render(<ExplorationQueryChips />);
    const dotFor = name =>
      within(screen.getByTestId(`query-chip-${name}`)).getByTestId('query-chip-status-dot');
    expect(dotFor('orders_q')).toHaveAttribute('data-status', 'success');
    expect(dotFor('cohort_q')).toHaveAttribute('data-status', 'error');
    expect(dotFor('never_run_q')).toHaveAttribute('data-status', 'idle');
  });

  test('shows a referenced-by badge counting draft insights that reference the query', () => {
    act(() => {
      useStore.getState().createModelTab('orders_q');
      useStore.setState({
        explorerChartInsightNames: ['churn_by_cohort', 'revenue_by_region'],
        explorerInsightStates: {
          churn_by_cohort: { props: { x: '${ref(orders_q).cohort}' }, interactions: [] },
          revenue_by_region: { props: { x: '${ref(orders_q).region}' }, interactions: [] },
        },
      });
    });
    render(<ExplorationQueryChips />);
    expect(screen.getByTestId('query-chip-orders_q-ref-badge')).toHaveTextContent('2');
  });

  test('no badge when nothing references the query', () => {
    act(() => {
      useStore.getState().createModelTab('orders_q');
    });
    render(<ExplorationQueryChips />);
    expect(screen.queryByTestId('query-chip-orders_q-ref-badge')).not.toBeInTheDocument();
  });

  // P5-D7 (e2e-gap-review.md final delta pass): the badge must source its
  // color from objectTypeConfigs' `model` token family (amber), never a
  // hand-rolled teal/cyan class — the one hit the Phase 5 restyle sweep
  // (befa20a4, B9) missed.
  test('the referenced-by badge uses objectTypeConfigs "model" tokens, never hand-rolled teal/cyan classes', () => {
    act(() => {
      useStore.getState().createModelTab('orders_q');
      useStore.setState({
        explorerChartInsightNames: ['churn_by_cohort'],
        explorerInsightStates: {
          churn_by_cohort: { props: { x: '${ref(orders_q).cohort}' }, interactions: [] },
        },
      });
    });
    render(<ExplorationQueryChips />);
    const badge = screen.getByTestId('query-chip-orders_q-ref-badge');
    expect(badge.className).toContain('bg-amber-100');
    expect(badge.className).toContain('text-amber-800');
    expect(badge.className).not.toMatch(/\bteal-|\bcyan-/);
  });

  describe('rename (active chip only)', () => {
    test('the ⋮ menu Rename action swaps the chip for an inline input; committing renames the tab', () => {
      act(() => {
        useStore.getState().createModelTab('orders_q');
      });
      render(<ExplorationQueryChips />);
      fireEvent.click(screen.getByTestId('query-chip-orders_q-menu-trigger'));
      fireEvent.click(screen.getByTestId('query-chip-orders_q-rename-action'));

      const input = screen.getByTestId('query-chip-orders_q-rename-input');
      fireEvent.change(input, { target: { value: 'orders_query' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(useStore.getState().explorerModelTabs).toEqual(['orders_query']);
      expect(screen.getByTestId('query-chip-orders_query')).toBeInTheDocument();
    });

    test('no-duplicate-names: renaming to an existing tab name shows an inline collision error and stays editable', () => {
      act(() => {
        useStore.getState().createModelTab('orders_q');
        useStore.getState().createModelTab('cohort_q');
      });
      render(<ExplorationQueryChips />);
      // cohort_q is active (most recently created).
      fireEvent.click(screen.getByTestId('query-chip-cohort_q-menu-trigger'));
      fireEvent.click(screen.getByTestId('query-chip-cohort_q-rename-action'));

      const input = screen.getByTestId('query-chip-cohort_q-rename-input');
      fireEvent.change(input, { target: { value: 'orders_q' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(screen.getByTestId('query-chip-cohort_q-rename-error')).toBeInTheDocument();
      // Still both original tabs — the rename did not go through.
      expect(useStore.getState().explorerModelTabs).toEqual(['orders_q', 'cohort_q']);
      // Still in edit mode for a retry.
      expect(screen.getByTestId('query-chip-cohort_q-rename-input')).toBeInTheDocument();
    });

    test('Escape cancels the rename without committing', () => {
      act(() => {
        useStore.getState().createModelTab('orders_q');
      });
      render(<ExplorationQueryChips />);
      fireEvent.click(screen.getByTestId('query-chip-orders_q-menu-trigger'));
      fireEvent.click(screen.getByTestId('query-chip-orders_q-rename-action'));
      const input = screen.getByTestId('query-chip-orders_q-rename-input');
      fireEvent.change(input, { target: { value: 'whatever' } });
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(useStore.getState().explorerModelTabs).toEqual(['orders_q']);
      expect(screen.getByTestId('query-chip-orders_q')).toBeInTheDocument();
    });
  });

  describe('delete', () => {
    test('deletes a query with no referrers immediately (no confirm dialog)', () => {
      act(() => {
        useStore.getState().createModelTab('orders_q');
        useStore.getState().createModelTab('cohort_q');
      });
      render(<ExplorationQueryChips />);
      fireEvent.click(screen.getByTestId('query-chip-cohort_q-menu-trigger'));
      fireEvent.click(screen.getByTestId('query-chip-cohort_q-delete-action'));

      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
      expect(useStore.getState().explorerModelTabs).toEqual(['orders_q']);
    });

    // Successor to explorer-insight-survives-model-close.spec.mjs (03's Phase
    // 3a gate: "query-chip delete-with-dependents warning story").
    test('warns via ConfirmDialog when draft insights reference the query; cancel keeps it', async () => {
      act(() => {
        useStore.getState().createModelTab('orders_q');
        useStore.getState().createModelTab('cohort_q');
        useStore.setState({
          explorerChartInsightNames: ['churn_by_cohort'],
          explorerInsightStates: {
            churn_by_cohort: { props: { x: '${ref(cohort_q).cohort}' }, interactions: [] },
          },
        });
      });
      render(<ExplorationQueryChips />);
      fireEvent.click(screen.getByTestId('query-chip-cohort_q-menu-trigger'));
      fireEvent.click(screen.getByTestId('query-chip-cohort_q-delete-action'));

      await screen.findByTestId('query-chip-cohort_q-delete-confirm');
      expect(screen.getByTestId('query-chip-cohort_q-delete-confirm')).toHaveTextContent(
        '1 draft insight'
      );

      fireEvent.click(screen.getByTestId('query-chip-cohort_q-delete-confirm-cancel'));
      expect(useStore.getState().explorerModelTabs).toEqual(['orders_q', 'cohort_q']);
    });

    test('confirming the warning deletes the query anyway', async () => {
      act(() => {
        useStore.getState().createModelTab('orders_q');
        useStore.getState().createModelTab('cohort_q');
        useStore.setState({
          explorerChartInsightNames: ['churn_by_cohort'],
          explorerInsightStates: {
            churn_by_cohort: { props: { x: '${ref(cohort_q).cohort}' }, interactions: [] },
          },
        });
      });
      render(<ExplorationQueryChips />);
      fireEvent.click(screen.getByTestId('query-chip-cohort_q-menu-trigger'));
      fireEvent.click(screen.getByTestId('query-chip-cohort_q-delete-action'));

      await screen.findByTestId('query-chip-cohort_q-delete-confirm');
      fireEvent.click(screen.getByTestId('query-chip-cohort_q-delete-confirm-confirm'));

      await waitFor(() => expect(useStore.getState().explorerModelTabs).toEqual(['orders_q']));
    });

    test('cannot delete the last remaining query — no Delete action offered', () => {
      act(() => {
        useStore.getState().createModelTab('only_q');
      });
      render(<ExplorationQueryChips />);
      fireEvent.click(screen.getByTestId('query-chip-only_q-menu-trigger'));
      expect(screen.queryByTestId('query-chip-only_q-delete-action')).not.toBeInTheDocument();
      // Rename is still offered even with one tab.
      expect(screen.getByTestId('query-chip-only_q-rename-action')).toBeInTheDocument();
    });
  });
});
