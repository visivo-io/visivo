/**
 * LibraryRowFlipPopover behaviour (VIS-776 / Track C C3).
 *
 * Verifies the popover renders the subject + an inline mini-lineage chain
 * derived from the existing zustand store. C-2's shared <MiniLineageCard>
 * is deferred to VIS-780 (blocked by D-6).
 */
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import useStore from '../../../../stores/store';
import LibraryRowFlipPopover, { buildChainFromStore } from './LibraryRowFlipPopover';

const SUBJECT_CHART = { type: 'chart', name: 'waterfall' };

const seedStore = () => {
  act(() => {
    useStore.setState({
      charts: [
        { name: 'waterfall', insights: ['revenue_growth'] },
      ],
      insights: [
        { name: 'revenue_growth', model: 'monthly_revenue' },
      ],
      models: [
        { name: 'monthly_revenue', source: 'pg' },
      ],
      csvScriptModels: [],
      localMergeModels: [],
      sources: [{ name: 'pg' }],
    });
  });
};

describe('LibraryRowFlipPopover', () => {
  beforeEach(() => {
    seedStore();
  });

  test('renders the subject name + lineage chain rows', () => {
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={jest.fn()} />);
    expect(screen.getByTestId('library-flip-popover')).toBeInTheDocument();
    expect(screen.getByTestId('library-flip-popover-name')).toHaveTextContent('waterfall');
    expect(screen.getByTestId('library-flip-popover-chain')).toBeInTheDocument();
    // The subject row + a chain of upstream nodes (insight → model → source).
    expect(
      screen.getByTestId('library-flip-popover-lineage-chart-waterfall')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('library-flip-popover-lineage-insight-revenue_growth')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('library-flip-popover-lineage-model-monthly_revenue')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('library-flip-popover-lineage-source-pg')
    ).toBeInTheDocument();
  });

  test('renders the empty body when no ancestors are available', () => {
    render(
      <LibraryRowFlipPopover obj={{ type: 'source', name: 'orphan' }} onClose={jest.fn()} />
    );
    expect(screen.getByTestId('library-flip-popover-empty')).toBeInTheDocument();
  });

  test('renders the deferred-card footer note pointing at VIS-780', () => {
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={jest.fn()} />);
    expect(screen.getByTestId('library-flip-popover-deferred-note')).toHaveTextContent(
      'VIS-780'
    );
  });

  test('fires onClose when the × button is clicked', () => {
    const onClose = jest.fn();
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('library-flip-popover-close'));
    expect(onClose).toHaveBeenCalled();
  });

  test('Escape key fires onClose', () => {
    const onClose = jest.fn();
    render(<LibraryRowFlipPopover obj={SUBJECT_CHART} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  test('buildChainFromStore walks chart → insight → model → source', () => {
    const chain = buildChainFromStore(
      { type: 'chart', name: 'waterfall' },
      {
        getChartByName: useStore.getState().getChartByName,
        getInsightByName: useStore.getState().getInsightByName,
        getModelByName: useStore.getState().getModelByName,
        csvScriptModels: [],
        localMergeModels: [],
      }
    );
    expect(chain.map((n) => `${n.type}:${n.name}`)).toEqual([
      'insight:revenue_growth',
      'model:monthly_revenue',
      'source:pg',
    ]);
  });
});
