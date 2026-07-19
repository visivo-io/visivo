import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExplorationPromoteModal from './ExplorationPromoteModal';
import useStore from '../../../stores/store';
import { buildPromoteChecklist } from '../../../stores/promoteChecklist';

jest.mock('../../../stores/promoteChecklist', () => ({ buildPromoteChecklist: jest.fn() }));

const row = (overrides = {}) => ({
  tier: 'model',
  type: 'model',
  name: 'orders_q',
  parentModel: null,
  status: 'new',
  valid: true,
  error: null,
  config: { sql: 'select 1' },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  useStore.setState({
    promoteExploration: jest.fn().mockResolvedValue({ success: true, results: [], reclassificationOffers: [] }),
    setInsightProp: jest.fn(),
    updateInsightInteraction: jest.fn(),
  });
});

describe('ExplorationPromoteModal', () => {
  test('shows a loading state while the checklist builds', () => {
    buildPromoteChecklist.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
    expect(screen.getByText('Checking your draft…')).toBeInTheDocument();
  });

  // P4-D1: `useWorkspaceTabShortcuts.js`'s `hasBlockingModal` guard finds
  // blocking modals purely via `[aria-modal="true"]` in the DOM — this pins
  // that the promote modal actually carries that marker (a regression here
  // would silently reopen the keyboard-shortcut race the guard exists to
  // close, with no test failure anywhere near this file to point at it).
  test('renders with role="dialog" aria-modal="true" (required by the shortcut-suppression guard)', () => {
    buildPromoteChecklist.mockReturnValue(new Promise(() => {}));
    render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Save to Project' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  test('shows "No changes to save" when the checklist is empty', async () => {
    buildPromoteChecklist.mockResolvedValue([]);
    render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
    expect(await screen.findByText('No changes to save.')).toBeInTheDocument();
  });

  test('groups rows under their tier heading', async () => {
    buildPromoteChecklist.mockResolvedValue([
      row(),
      row({ tier: 'field', type: 'metric', name: 'churn_rate', parentModel: 'orders_q' }),
      row({ tier: 'insight', type: 'insight', name: 'churn_by_cohort' }),
      row({ tier: 'chart', type: 'chart', name: 'churn_chart' }),
    ]);
    render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
    expect(await screen.findByText('MODELS')).toBeInTheDocument();
    expect(screen.getByText('FIELDS')).toBeInTheDocument();
    expect(screen.getByText('INSIGHTS')).toBeInTheDocument();
    expect(screen.getByText('CHART')).toBeInTheDocument();
  });

  test('shows the parentModel suffix for a field row', async () => {
    buildPromoteChecklist.mockResolvedValue([
      row({ tier: 'field', type: 'metric', name: 'churn_rate', parentModel: 'orders_q' }),
    ]);
    render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId('promote-row-metric-churn_rate')).toHaveTextContent('(→ orders_q)')
    );
  });

  test('default selection: every valid row is pre-checked', async () => {
    buildPromoteChecklist.mockResolvedValue([row(), row({ name: 'bad', valid: false, error: 'boom' })]);
    render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId('promote-row-model-orders_q-checkbox')).toBeChecked()
    );
    expect(screen.getByTestId('promote-row-model-bad-checkbox')).not.toBeChecked();
    expect(screen.getByTestId('promote-row-model-bad-checkbox')).toBeDisabled();
    expect(screen.getByTestId('exploration-promote-submit')).toHaveTextContent('Promote 1 selected');
  });

  test('a failed row is visible, flagged, and un-checkable — never blocks a valid sibling', async () => {
    buildPromoteChecklist.mockResolvedValue([
      row(),
      row({ name: 'bad_ratio', valid: false, error: 'expression fails: sqlglot parse error' }),
    ]);
    render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId('promote-row-model-bad_ratio-verdict')).toHaveTextContent(
        'expression fails'
      )
    );
    // Clicking the disabled checkbox does nothing.
    fireEvent.click(screen.getByTestId('promote-row-model-bad_ratio-checkbox'));
    expect(screen.getByTestId('exploration-promote-submit')).toHaveTextContent('Promote 1 selected');
  });

  test('a "modified" row shows "updates existing ✎"', async () => {
    buildPromoteChecklist.mockResolvedValue([row({ status: 'modified' })]);
    render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId('promote-row-model-orders_q-verdict')).toHaveTextContent(
        'updates existing'
      )
    );
  });

  test('unchecking a row excludes it from the selection count', async () => {
    buildPromoteChecklist.mockResolvedValue([row(), row({ tier: 'insight', type: 'insight', name: 'i' })]);
    render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toHaveTextContent('Promote 2 selected'));
    fireEvent.click(screen.getByTestId('promote-row-model-orders_q-checkbox'));
    expect(screen.getByTestId('exploration-promote-submit')).toHaveTextContent('Promote 1 selected');
  });

  test('Promote submit button is disabled with zero rows selected', async () => {
    buildPromoteChecklist.mockResolvedValue([row()]);
    render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
    fireEvent.click(screen.getByTestId('promote-row-model-orders_q-checkbox'));
    expect(screen.getByTestId('exploration-promote-submit')).toBeDisabled();
  });

  test('clicking Promote calls promoteExploration with the selection, shows the success message, and stays open until the user clicks Close', async () => {
    buildPromoteChecklist.mockResolvedValue([row()]);
    const promoteExploration = jest
      .fn()
      .mockResolvedValue({ success: true, results: [{ type: 'model', name: 'orders_q', success: true, error: null }], reclassificationOffers: [] });
    useStore.setState({ promoteExploration });
    const onClose = jest.fn();
    render(<ExplorationPromoteModal explorationId="exp_1" onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());

    fireEvent.click(screen.getByTestId('exploration-promote-submit'));

    await waitFor(() =>
      expect(promoteExploration).toHaveBeenCalledWith('exp_1', [{ type: 'model', name: 'orders_q' }])
    );
    // Deliberately does NOT auto-close on the common all-valid, no-collision
    // path: `setPromotedThisRun` and a same-tick `onClose()` would land in
    // the same React commit, so the "Promoted N objects" confirmation would
    // never actually paint. The user reviews it and dismisses via "Close".
    expect(await screen.findByTestId('exploration-promote-success')).toHaveTextContent(
      'Promoted 1 object.'
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('exploration-promote-cancel')).toHaveTextContent('Close');
    fireEvent.click(screen.getByTestId('exploration-promote-cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  test('a partial failure stays open and shows the error, does not auto-close', async () => {
    buildPromoteChecklist.mockResolvedValue([row(), row({ name: 'flaky' })]);
    const promoteExploration = jest.fn().mockResolvedValue({
      success: false,
      results: [
        { type: 'model', name: 'orders_q', success: true, error: null },
        { type: 'model', name: 'flaky', success: false, error: 'server rejected it' },
      ],
      reclassificationOffers: [],
    });
    useStore.setState({ promoteExploration });
    const onClose = jest.fn();
    render(<ExplorationPromoteModal explorationId="exp_1" onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());

    fireEvent.click(screen.getByTestId('exploration-promote-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('exploration-promote-error')).toHaveTextContent('server rejected it')
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  test('a reclassification offer stays open and renders the FieldSwapOfferBanner', async () => {
    buildPromoteChecklist.mockResolvedValue([row({ tier: 'field', type: 'metric' })]);
    const promoteExploration = jest.fn().mockResolvedValue({
      success: true,
      results: [{ type: 'metric', name: 'orders_q', success: true, error: null }],
      reclassificationOffers: [
        {
          promotedType: 'metric',
          promotedName: 'orders_q',
          slots: [{ insightName: 'other', location: 'prop', key: 'y', swapTo: { kind: 'metricRef', ref: 'orders_q' } }],
        },
      ],
    });
    useStore.setState({ promoteExploration });
    const onClose = jest.fn();
    render(<ExplorationPromoteModal explorationId="exp_1" onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());

    fireEvent.click(screen.getByTestId('exploration-promote-submit'));

    expect(await screen.findByTestId('field-swap-offer-banner')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('Cancel closes without ever calling promoteExploration', async () => {
    buildPromoteChecklist.mockResolvedValue([row()]);
    const promoteExploration = jest.fn();
    useStore.setState({ promoteExploration });
    const onClose = jest.fn();
    render(<ExplorationPromoteModal explorationId="exp_1" onClose={onClose} />);
    expect(await screen.findByTestId('exploration-promote-cancel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('exploration-promote-cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(promoteExploration).not.toHaveBeenCalled();
  });
});
