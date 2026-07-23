import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
  test('with no explorationId at all, returnTo resolves to null rather than throwing', async () => {
    buildPromoteChecklist.mockResolvedValue([row()]);
    useStore.setState({
      promoteExploration: jest.fn().mockResolvedValue({
        success: true,
        results: [{ type: 'model', name: 'orders_q', success: true, error: null }],
        reclassificationOffers: [],
      }),
    });
    render(<ExplorationPromoteModal explorationId={null} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
    // No return_to-specific offer can ever appear without a real explorationId.
    fireEvent.click(screen.getByTestId('exploration-promote-submit'));
    await screen.findByTestId('exploration-promote-success');
    expect(screen.queryByTestId('exploration-promote-return-to-offer')).not.toBeInTheDocument();
  });

  test('tolerates the store having no `dashboards` key at all (falls back to an empty list)', async () => {
    buildPromoteChecklist.mockResolvedValue([row({ tier: 'chart', type: 'chart', name: 'churn_chart' })]);
    useStore.setState({
      promoteExploration: jest.fn().mockResolvedValue({
        success: true,
        results: [{ type: 'chart', name: 'churn_chart', success: true, error: null }],
        reclassificationOffers: [],
      }),
      dashboards: undefined,
      workspaceExplorations: { byId: { exp_1: { id: 'exp_1', returnTo: null } }, order: ['exp_1'] },
    });
    render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
    fireEvent.click(screen.getByTestId('exploration-promote-submit'));
    await screen.findByTestId('exploration-promote-success');
    // No dashboards known at all -> no fallback placement offer either.
    expect(
      screen.queryByTestId('exploration-promote-fallback-dashboard-offer')
    ).not.toBeInTheDocument();
  });

  test('does not warn or crash when the checklist resolves AFTER the modal has already unmounted', async () => {
    let resolveChecklist;
    buildPromoteChecklist.mockReturnValue(
      new Promise(resolve => {
        resolveChecklist = resolve;
      })
    );
    const { unmount } = render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
    unmount();
    // The cleanup flips `cancelled = true`; resolving afterward must be a
    // silent no-op (no "set state on unmounted component" warning, which
    // setupTests.js would fail the test on if it fired via console.error).
    await act(async () => {
      resolveChecklist([row()]);
      await Promise.resolve();
    });
  });

  test('a total promote result with no `results` key at all never crashes (defaults treated as zero rows)', async () => {
    buildPromoteChecklist.mockResolvedValue([row()]);
    const promoteExploration = jest.fn().mockResolvedValue({ success: true }); // no `results` key
    useStore.setState({ promoteExploration });
    render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
    fireEvent.click(screen.getByTestId('exploration-promote-submit'));
    await waitFor(() => expect(promoteExploration).toHaveBeenCalled());
    // Zero succeeded, zero failed -> neither banner renders, and nothing throws.
    expect(screen.queryByTestId('exploration-promote-success')).not.toBeInTheDocument();
    expect(screen.queryByTestId('exploration-promote-error')).not.toBeInTheDocument();
  });

  test('the failure-count message pluralizes "objects" when more than one row fails', async () => {
    buildPromoteChecklist.mockResolvedValue([row({ name: 'flaky1' }), row({ name: 'flaky2' })]);
    const promoteExploration = jest.fn().mockResolvedValue({
      success: false,
      results: [
        { type: 'model', name: 'flaky1', success: false, error: 'boom1' },
        { type: 'model', name: 'flaky2', success: false, error: 'boom2' },
      ],
      reclassificationOffers: [],
    });
    useStore.setState({ promoteExploration });
    render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
    fireEvent.click(screen.getByTestId('exploration-promote-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('exploration-promote-error')).toHaveTextContent(
        '2 objects failed to promote'
      )
    );
  });

  test('clicking the backdrop overlay closes the modal (not while promoting)', async () => {
    buildPromoteChecklist.mockResolvedValue([row()]);
    const onClose = jest.fn();
    render(<ExplorationPromoteModal explorationId="exp_1" onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
    fireEvent.click(screen.getByTestId('exploration-promote-modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('clicking the backdrop overlay does nothing while a promote is in flight', async () => {
    buildPromoteChecklist.mockResolvedValue([row()]);
    let resolvePromote;
    useStore.setState({
      promoteExploration: jest.fn(() => new Promise(resolve => { resolvePromote = resolve; })),
    });
    const onClose = jest.fn();
    render(<ExplorationPromoteModal explorationId="exp_1" onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
    fireEvent.click(screen.getByTestId('exploration-promote-submit'));
    fireEvent.click(screen.getByTestId('exploration-promote-modal'));
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      resolvePromote({ success: true, results: [], reclassificationOffers: [] });
      await Promise.resolve();
    });
  });

  test('clicking INSIDE the dialog (not the backdrop) never closes the modal', async () => {
    buildPromoteChecklist.mockResolvedValue([row()]);
    const onClose = jest.fn();
    render(<ExplorationPromoteModal explorationId="exp_1" onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
    fireEvent.click(screen.getByRole('dialog', { name: 'Save to Project' }));
    expect(onClose).not.toHaveBeenCalled();
  });

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

  test('an invalid row with no error message at all falls back to the generic "invalid" verdict text', async () => {
    buildPromoteChecklist.mockResolvedValue([row({ name: 'mystery_fail', valid: false, error: null })]);
    render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId('promote-row-model-mystery_fail-verdict')).toHaveTextContent('invalid')
    );
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

  test('re-checking a previously unchecked row restores it to the selection', async () => {
    buildPromoteChecklist.mockResolvedValue([row()]);
    render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toHaveTextContent('Promote 1 selected'));
    fireEvent.click(screen.getByTestId('promote-row-model-orders_q-checkbox')); // uncheck
    expect(screen.getByTestId('exploration-promote-submit')).toHaveTextContent('Promote 0 selected');
    fireEvent.click(screen.getByTestId('promote-row-model-orders_q-checkbox')); // re-check
    expect(screen.getByTestId('exploration-promote-submit')).toHaveTextContent('Promote 1 selected');
    expect(screen.getByTestId('promote-row-model-orders_q-checkbox')).toBeChecked();
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

  // P5-D2 (e2e-gap-review.md "Final delta pass") — a partial-failure promote
  // must not forfeit the succeeded rows' own success messaging: the error and
  // success banners are independent, not mutually exclusive.
  test('a partial failure still shows the success banner for the rows that DID succeed', async () => {
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
    render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());

    fireEvent.click(screen.getByTestId('exploration-promote-submit'));

    await screen.findByTestId('exploration-promote-error');
    // Both banners coexist — the failure of 'flaky' must never hide that
    // 'orders_q' really did promote.
    expect(screen.getByTestId('exploration-promote-success')).toHaveTextContent('Promoted 1 object');
  });

  // Overall success===false but zero rows actually succeeded — the success
  // banner (which would otherwise read "Promoted 0 objects") must stay hidden.
  test('a total failure (zero succeeded rows) shows only the error banner, never "Promoted 0 objects"', async () => {
    buildPromoteChecklist.mockResolvedValue([row({ name: 'flaky' })]);
    const promoteExploration = jest.fn().mockResolvedValue({
      success: false,
      results: [{ type: 'model', name: 'flaky', success: false, error: 'server rejected it' }],
      reclassificationOffers: [],
    });
    useStore.setState({ promoteExploration });
    render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());

    fireEvent.click(screen.getByTestId('exploration-promote-submit'));

    await screen.findByTestId('exploration-promote-error');
    expect(screen.queryByTestId('exploration-promote-success')).not.toBeInTheDocument();
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

  test('dismissing a reclassification offer removes just that offer, without closing the modal', async () => {
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

    fireEvent.click(screen.getByTestId('field-swap-offer-orders_q-dismiss'));

    expect(screen.queryByTestId('field-swap-offer-banner')).not.toBeInTheDocument();
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

  // VIS-1068 — dashboard round-trip completion ("Place in <dashboard>").
  describe('return_to / "Place in <dashboard>"', () => {
    const seedReturnTo = (returnTo, extra = {}) => {
      useStore.setState({
        workspaceExplorations: {
          byId: { exp_1: { id: 'exp_1', returnTo } },
          order: ['exp_1'],
        },
        dashboards: [{ name: 'sales' }],
        openWorkspaceTab: jest.fn(),
        placeChartInDashboardSlot: jest.fn().mockResolvedValue({ success: true }),
        consumeExplorationReturnTo: jest.fn().mockResolvedValue({ success: true }),
        ...extra,
      });
    };

    const promoteChartResult = (extra = {}) => ({
      success: true,
      results: [{ type: 'chart', name: 'churn_chart', tier: 'chart', success: true, error: null }],
      reclassificationOffers: [],
      ...extra,
    });

    // ux-audit.md "post-promote offers never appear" finding (⚠
    // conflicts-with-e2e — promote-roundtrip #9): without a return_to
    // intent, the OLD offer stays absent, but the fix's fallback offer
    // (reusing the same placement plumbing) now appears instead — the
    // promote -> dashboard round-trip is never a dead end just because the
    // user didn't enter through the one narrow "+New Chart" path.
    test('no return_to-specific offer without a return_to on the exploration — the generic fallback offer appears instead', async () => {
      seedReturnTo(null);
      buildPromoteChecklist.mockResolvedValue([row({ tier: 'chart', type: 'chart', name: 'churn_chart' })]);
      useStore.setState({ promoteExploration: jest.fn().mockResolvedValue(promoteChartResult()) });
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));
      await screen.findByTestId('exploration-promote-success');
      expect(screen.queryByTestId('exploration-promote-return-to-offer')).not.toBeInTheDocument();
      const fallback = screen.getByTestId('exploration-promote-fallback-dashboard-offer');
      expect(fallback).toHaveTextContent('churn_chart');
    });

    test('no fallback offer when no dashboards exist at all', async () => {
      seedReturnTo(null, { dashboards: [] });
      buildPromoteChecklist.mockResolvedValue([row({ tier: 'chart', type: 'chart', name: 'churn_chart' })]);
      useStore.setState({ promoteExploration: jest.fn().mockResolvedValue(promoteChartResult()) });
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));
      await screen.findByTestId('exploration-promote-success');
      expect(
        screen.queryByTestId('exploration-promote-fallback-dashboard-offer')
      ).not.toBeInTheDocument();
    });

    test('no fallback offer when no chart was promoted this run (even with no return_to)', async () => {
      seedReturnTo(null);
      buildPromoteChecklist.mockResolvedValue([row()]);
      useStore.setState({
        promoteExploration: jest.fn().mockResolvedValue({
          success: true,
          results: [{ type: 'model', name: 'orders_q', success: true, error: null }],
          reclassificationOffers: [],
        }),
      });
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));
      await screen.findByTestId('exploration-promote-success');
      expect(
        screen.queryByTestId('exploration-promote-fallback-dashboard-offer')
      ).not.toBeInTheDocument();
    });

    test('the return_to-specific offer takes priority — the fallback never shows alongside it', async () => {
      seedReturnTo({ dashboard: 'sales', slot: 'r1-i1' });
      buildPromoteChecklist.mockResolvedValue([row({ tier: 'chart', type: 'chart', name: 'churn_chart' })]);
      useStore.setState({ promoteExploration: jest.fn().mockResolvedValue(promoteChartResult()) });
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));
      await screen.findByTestId('exploration-promote-return-to-offer');
      expect(
        screen.queryByTestId('exploration-promote-fallback-dashboard-offer')
      ).not.toBeInTheDocument();
    });

    test('accepting the fallback offer places the chart in the chosen dashboard, navigates, and closes', async () => {
      seedReturnTo(null);
      buildPromoteChecklist.mockResolvedValue([row({ tier: 'chart', type: 'chart', name: 'churn_chart' })]);
      useStore.setState({ promoteExploration: jest.fn().mockResolvedValue(promoteChartResult()) });
      const onClose = jest.fn();
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={onClose} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));
      await screen.findByTestId('exploration-promote-fallback-dashboard-offer');

      fireEvent.click(screen.getByTestId('exploration-promote-fallback-place'));

      await waitFor(() =>
        expect(useStore.getState().placeChartInDashboardSlot).toHaveBeenCalledWith(
          'sales',
          'churn_chart'
        )
      );
      await waitFor(() =>
        expect(useStore.getState().openWorkspaceTab).toHaveBeenCalledWith({
          id: 'dashboard:sales',
          type: 'dashboard',
          name: 'sales',
        })
      );
      expect(onClose).toHaveBeenCalled();
    });

    test('a fallback placement failure shows an inline error and does not close', async () => {
      seedReturnTo(null, {
        placeChartInDashboardSlot: jest.fn().mockResolvedValue({ success: false, error: 'slot taken' }),
      });
      buildPromoteChecklist.mockResolvedValue([row({ tier: 'chart', type: 'chart', name: 'churn_chart' })]);
      useStore.setState({ promoteExploration: jest.fn().mockResolvedValue(promoteChartResult()) });
      const onClose = jest.fn();
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={onClose} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));
      await screen.findByTestId('exploration-promote-fallback-dashboard-offer');

      fireEvent.click(screen.getByTestId('exploration-promote-fallback-place'));

      await waitFor(() =>
        expect(screen.getByTestId('exploration-promote-fallback-place-error')).toHaveTextContent(
          'slot taken'
        )
      );
      expect(onClose).not.toHaveBeenCalled();
    });

    test('a fallback placement failure with no error message uses the generic fallback text', async () => {
      seedReturnTo(null, {
        placeChartInDashboardSlot: jest.fn().mockResolvedValue({ success: false }), // no `error` key
      });
      buildPromoteChecklist.mockResolvedValue([row({ tier: 'chart', type: 'chart', name: 'churn_chart' })]);
      useStore.setState({ promoteExploration: jest.fn().mockResolvedValue(promoteChartResult()) });
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));
      await screen.findByTestId('exploration-promote-fallback-dashboard-offer');

      fireEvent.click(screen.getByTestId('exploration-promote-fallback-place'));

      await waitFor(() =>
        expect(screen.getByTestId('exploration-promote-fallback-place-error')).toHaveTextContent(
          'Could not place the chart in the dashboard'
        )
      );
    });

    // The fallback "Add" button's own disabled attribute only checks
    // `fallbackPlacing || !fallbackDashboardName` — not whether
    // `placeChartInDashboardSlot` itself exists — so a click can still land
    // when the store never wired that action up, exercising the handler's
    // own defensive guard rather than the DOM's disabled state.
    test('clicking the fallback Add button when placeChartInDashboardSlot is missing from the store is a safe no-op', async () => {
      seedReturnTo(null, { placeChartInDashboardSlot: undefined });
      buildPromoteChecklist.mockResolvedValue([row({ tier: 'chart', type: 'chart', name: 'churn_chart' })]);
      useStore.setState({ promoteExploration: jest.fn().mockResolvedValue(promoteChartResult()) });
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));
      await screen.findByTestId('exploration-promote-fallback-dashboard-offer');

      expect(() =>
        fireEvent.click(screen.getByTestId('exploration-promote-fallback-place'))
      ).not.toThrow();
      expect(screen.queryByTestId('exploration-promote-fallback-place-error')).not.toBeInTheDocument();
    });

    test('no offer when return_to is set but no chart was promoted this run', async () => {
      seedReturnTo({ dashboard: 'sales' });
      buildPromoteChecklist.mockResolvedValue([row()]);
      useStore.setState({
        promoteExploration: jest.fn().mockResolvedValue({
          success: true,
          results: [{ type: 'model', name: 'orders_q', success: true, error: null }],
          reclassificationOffers: [],
        }),
      });
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));
      await screen.findByTestId('exploration-promote-success');
      expect(screen.queryByTestId('exploration-promote-return-to-offer')).not.toBeInTheDocument();
    });

    test('accepting places the chart, consumes return_to, navigates to the dashboard tab, and closes', async () => {
      seedReturnTo({ dashboard: 'sales', slot: 'r1-i1' });
      buildPromoteChecklist.mockResolvedValue([row({ tier: 'chart', type: 'chart', name: 'churn_chart' })]);
      useStore.setState({ promoteExploration: jest.fn().mockResolvedValue(promoteChartResult()) });
      const onClose = jest.fn();
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={onClose} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));

      const offer = await screen.findByTestId('exploration-promote-return-to-offer');
      expect(offer).toHaveTextContent('churn_chart');
      expect(offer).toHaveTextContent('sales');

      fireEvent.click(screen.getByTestId('exploration-promote-place-in-dashboard'));

      await waitFor(() =>
        expect(useStore.getState().placeChartInDashboardSlot).toHaveBeenCalledWith(
          'sales',
          'churn_chart',
          'r1-i1'
        )
      );
      await waitFor(() =>
        expect(useStore.getState().consumeExplorationReturnTo).toHaveBeenCalledWith('exp_1')
      );
      await waitFor(() =>
        expect(useStore.getState().openWorkspaceTab).toHaveBeenCalledWith({
          id: 'dashboard:sales',
          type: 'dashboard',
          name: 'sales',
        })
      );
      expect(onClose).toHaveBeenCalled();
    });

    test('declining consumes return_to (explicit choice), does not place or navigate, and does not close', async () => {
      seedReturnTo({ dashboard: 'sales' });
      buildPromoteChecklist.mockResolvedValue([row({ tier: 'chart', type: 'chart', name: 'churn_chart' })]);
      useStore.setState({ promoteExploration: jest.fn().mockResolvedValue(promoteChartResult()) });
      const onClose = jest.fn();
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={onClose} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));
      await screen.findByTestId('exploration-promote-return-to-offer');

      fireEvent.click(screen.getByTestId('exploration-promote-decline-placement'));

      await waitFor(() =>
        expect(useStore.getState().consumeExplorationReturnTo).toHaveBeenCalledWith('exp_1')
      );
      expect(useStore.getState().placeChartInDashboardSlot).not.toHaveBeenCalled();
      expect(useStore.getState().openWorkspaceTab).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    test('a return_to whose dashboard no longer exists renders the offer DISABLED with a tooltip', async () => {
      seedReturnTo({ dashboard: 'deleted-dashboard' }, { dashboards: [{ name: 'sales' }] });
      buildPromoteChecklist.mockResolvedValue([row({ tier: 'chart', type: 'chart', name: 'churn_chart' })]);
      useStore.setState({ promoteExploration: jest.fn().mockResolvedValue(promoteChartResult()) });
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));

      const placeButton = await screen.findByTestId('exploration-promote-place-in-dashboard');
      expect(placeButton).toBeDisabled();
      expect(placeButton).toHaveAttribute('title', '"deleted-dashboard" no longer exists');
      // Still consumable via decline even though placement is disabled.
      expect(screen.getByTestId('exploration-promote-decline-placement')).toBeEnabled();
    });

    // P5-D2 — the offer must key on the CHART row's own success, never on
    // whether every selected row promoted (a sibling model/metric failing is
    // "normal" partial promotion, per handlePromote's own docstring).
    test('a partial-failure promote that includes a successfully-promoted chart still renders the Place-in-dashboard offer', async () => {
      seedReturnTo({ dashboard: 'sales', slot: 'r1-i1' });
      buildPromoteChecklist.mockResolvedValue([
        row({ tier: 'chart', type: 'chart', name: 'churn_chart' }),
        row({ name: 'flaky' }),
      ]);
      useStore.setState({
        promoteExploration: jest.fn().mockResolvedValue({
          success: false,
          results: [
            { type: 'chart', name: 'churn_chart', success: true, error: null },
            { type: 'model', name: 'flaky', success: false, error: 'server rejected it' },
          ],
          reclassificationOffers: [],
        }),
      });
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));

      const offer = await screen.findByTestId('exploration-promote-return-to-offer');
      expect(offer).toHaveTextContent('churn_chart');
      // The error for the sibling failure coexists, not either/or.
      expect(screen.getByTestId('exploration-promote-error')).toHaveTextContent('server rejected it');
    });

    // P5-D5 — declining is no longer a bare fire-and-forget: a failed
    // consume-return-to must surface an error and keep the button re-clickable
    // rather than silently letting the offer resurface with no feedback.
    test('a failed decline surfaces an inline error and leaves the offer re-declinable', async () => {
      seedReturnTo(
        { dashboard: 'sales' },
        { consumeExplorationReturnTo: jest.fn().mockResolvedValue({ success: false, error: 'network blip' }) }
      );
      buildPromoteChecklist.mockResolvedValue([row({ tier: 'chart', type: 'chart', name: 'churn_chart' })]);
      useStore.setState({ promoteExploration: jest.fn().mockResolvedValue(promoteChartResult()) });
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));
      await screen.findByTestId('exploration-promote-return-to-offer');

      fireEvent.click(screen.getByTestId('exploration-promote-decline-placement'));

      await waitFor(() =>
        expect(screen.getByTestId('exploration-promote-decline-error')).toHaveTextContent('network blip')
      );
      // The offer itself is still present (return_to was never actually
      // cleared server-side) and the decline button is re-clickable, not
      // stuck disabled.
      expect(screen.getByTestId('exploration-promote-return-to-offer')).toBeInTheDocument();
      expect(screen.getByTestId('exploration-promote-decline-placement')).toBeEnabled();
    });

    test('a failed decline with no error message uses the generic fallback text', async () => {
      seedReturnTo(
        { dashboard: 'sales' },
        { consumeExplorationReturnTo: jest.fn().mockResolvedValue({ success: false }) } // no `error` key
      );
      buildPromoteChecklist.mockResolvedValue([row({ tier: 'chart', type: 'chart', name: 'churn_chart' })]);
      useStore.setState({ promoteExploration: jest.fn().mockResolvedValue(promoteChartResult()) });
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));
      await screen.findByTestId('exploration-promote-return-to-offer');

      fireEvent.click(screen.getByTestId('exploration-promote-decline-placement'));

      await waitFor(() =>
        expect(screen.getByTestId('exploration-promote-decline-error')).toHaveTextContent(
          'Could not dismiss the placement offer'
        )
      );
    });

    test('a placement failure shows an inline error and does not consume return_to or close', async () => {
      seedReturnTo({ dashboard: 'sales' }, {
        placeChartInDashboardSlot: jest.fn().mockResolvedValue({ success: false, error: 'slot taken' }),
      });
      buildPromoteChecklist.mockResolvedValue([row({ tier: 'chart', type: 'chart', name: 'churn_chart' })]);
      useStore.setState({ promoteExploration: jest.fn().mockResolvedValue(promoteChartResult()) });
      const onClose = jest.fn();
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={onClose} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));
      await screen.findByTestId('exploration-promote-return-to-offer');

      fireEvent.click(screen.getByTestId('exploration-promote-place-in-dashboard'));

      await waitFor(() =>
        expect(screen.getByTestId('exploration-promote-place-error')).toHaveTextContent('slot taken')
      );
      expect(useStore.getState().consumeExplorationReturnTo).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    // Mirrors the fallback-path guard test above: the "Place in <dashboard>"
    // button's own `disabled` attribute doesn't check for
    // `placeChartInDashboardSlot` presence, so a click can still land and
    // exercise the handler's own defensive guard when the store never wired
    // that action up.
    test('clicking Place-in-dashboard when placeChartInDashboardSlot is missing from the store is a safe no-op', async () => {
      seedReturnTo({ dashboard: 'sales', slot: 'r1-i1' }, { placeChartInDashboardSlot: undefined });
      buildPromoteChecklist.mockResolvedValue([row({ tier: 'chart', type: 'chart', name: 'churn_chart' })]);
      useStore.setState({ promoteExploration: jest.fn().mockResolvedValue(promoteChartResult()) });
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));
      await screen.findByTestId('exploration-promote-return-to-offer');

      expect(() =>
        fireEvent.click(screen.getByTestId('exploration-promote-place-in-dashboard'))
      ).not.toThrow();
      expect(screen.queryByTestId('exploration-promote-place-error')).not.toBeInTheDocument();
      expect(useStore.getState().consumeExplorationReturnTo).not.toHaveBeenCalled();
    });

    // The fallback offer's dashboard <Select> defaults to `dashboards[0]?.name`
    // — a dashboard entry with no `name` at all must fall back to an empty
    // string rather than rendering `undefined`.
    test('defaults the fallback dashboard select to an empty string when the first dashboard has no name', async () => {
      seedReturnTo(null, { dashboards: [{}] }); // no `name` key at all
      buildPromoteChecklist.mockResolvedValue([row({ tier: 'chart', type: 'chart', name: 'churn_chart' })]);
      useStore.setState({ promoteExploration: jest.fn().mockResolvedValue(promoteChartResult()) });
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));
      const offer = await screen.findByTestId('exploration-promote-fallback-dashboard-offer');
      // The "Add" button requires a non-empty fallbackDashboardName — with no
      // name to default to, it stays disabled rather than crashing.
      expect(screen.getByTestId('exploration-promote-fallback-place')).toBeDisabled();
      expect(offer).toBeInTheDocument();
    });

    test('a placement failure with no error message uses the generic fallback text', async () => {
      seedReturnTo({ dashboard: 'sales' }, {
        placeChartInDashboardSlot: jest.fn().mockResolvedValue({ success: false }), // no `error` key
      });
      buildPromoteChecklist.mockResolvedValue([row({ tier: 'chart', type: 'chart', name: 'churn_chart' })]);
      useStore.setState({ promoteExploration: jest.fn().mockResolvedValue(promoteChartResult()) });
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));
      await screen.findByTestId('exploration-promote-return-to-offer');

      fireEvent.click(screen.getByTestId('exploration-promote-place-in-dashboard'));

      await waitFor(() =>
        expect(screen.getByTestId('exploration-promote-place-error')).toHaveTextContent(
          'Could not place the chart in the dashboard'
        )
      );
    });

    test('a consume-return-to failure with no error message uses the generic fallback text', async () => {
      seedReturnTo(
        { dashboard: 'sales', slot: 'r1-i1' },
        { consumeExplorationReturnTo: jest.fn().mockResolvedValue({ success: false }) } // no `error` key
      );
      buildPromoteChecklist.mockResolvedValue([row({ tier: 'chart', type: 'chart', name: 'churn_chart' })]);
      useStore.setState({ promoteExploration: jest.fn().mockResolvedValue(promoteChartResult()) });
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));
      await screen.findByTestId('exploration-promote-return-to-offer');

      fireEvent.click(screen.getByTestId('exploration-promote-place-in-dashboard'));

      await waitFor(() =>
        expect(screen.getByTestId('exploration-promote-place-error')).toHaveTextContent(
          'Chart placed, but could not clear the placement prompt — try again.'
        )
      );
    });

    // P6-D10 (e2e-gap-review.md "Phase 6 delta pass") — the ACCEPT path
    // (unlike decline, P5-D5) never checked consumeExplorationReturnTo's
    // `{success: false}` return. A consume failure after a successful
    // placement must surface an error and NOT navigate/close — closing here
    // would hide that `return_to` is still persisted, letting the offer
    // resurface on a later promote and risk a duplicate dashboard slot.
    test('a consume-return-to failure AFTER a successful placement surfaces an error and does not navigate or close', async () => {
      seedReturnTo(
        { dashboard: 'sales', slot: 'r1-i1' },
        { consumeExplorationReturnTo: jest.fn().mockResolvedValue({ success: false, error: 'write conflict' }) }
      );
      buildPromoteChecklist.mockResolvedValue([row({ tier: 'chart', type: 'chart', name: 'churn_chart' })]);
      useStore.setState({ promoteExploration: jest.fn().mockResolvedValue(promoteChartResult()) });
      const onClose = jest.fn();
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={onClose} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));
      await screen.findByTestId('exploration-promote-return-to-offer');

      fireEvent.click(screen.getByTestId('exploration-promote-place-in-dashboard'));

      // The chart WAS placed — that call still fires and succeeds.
      await waitFor(() =>
        expect(useStore.getState().placeChartInDashboardSlot).toHaveBeenCalledTimes(1)
      );
      await waitFor(() =>
        expect(screen.getByTestId('exploration-promote-place-error')).toHaveTextContent(
          'write conflict'
        )
      );
      expect(useStore.getState().openWorkspaceTab).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    // P5-D4 — a real double-click can dispatch both events before React
    // re-renders the button `disabled`; the synchronous `placingRef` guard
    // must stop the second call regardless (mirrors ExplorationPane's
    // `duplicatingRef`, VIS-1084/VIS-1086).
    test('rapid double-click on Place-in-dashboard fires exactly one placement', async () => {
      seedReturnTo({ dashboard: 'sales', slot: 'r1-i1' });
      buildPromoteChecklist.mockResolvedValue([row({ tier: 'chart', type: 'chart', name: 'churn_chart' })]);
      useStore.setState({ promoteExploration: jest.fn().mockResolvedValue(promoteChartResult()) });
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));
      await screen.findByTestId('exploration-promote-return-to-offer');

      const button = screen.getByTestId('exploration-promote-place-in-dashboard');
      // Both clicks MUST land inside the same `act()` — two separate
      // `fireEvent.click()` calls each flush a render in between, so by the
      // second call the button's own `disabled={placing}` attribute has
      // already been patched into the DOM and jsdom itself swallows the
      // click. Firing both before React ever gets to re-render is what
      // actually exercises the synchronous `placingRef` guard (the real
      // double-click race it defends against — see the P5-D4 docstring).
      // Both clicks must be batched into ONE act() on purpose: two separate
      // fireEvent.click() calls each flush a render in between, so by the
      // second call the button's own disabled attribute is already patched
      // into the DOM and jsdom swallows the click — that would test the
      // DOM's disabled gating, not the synchronous ref guard this test
      // targets.
      // eslint-disable-next-line testing-library/no-unnecessary-act
      act(() => {
        fireEvent.click(button);
        fireEvent.click(button);
      });

      await waitFor(() =>
        expect(useStore.getState().consumeExplorationReturnTo).toHaveBeenCalledTimes(1)
      );
      expect(useStore.getState().placeChartInDashboardSlot).toHaveBeenCalledTimes(1);
    });

    // P6-D11 (e2e-gap-review.md "Phase 6 delta pass") — handleDeclinePlacement
    // was made async in the same P5-D5 pass that added `placingRef` to the
    // adjacent "Place" button, but never got its own in-flight guard. Mirrors
    // the double-click test above for the decline button.
    test('rapid double-click on Not-now fires exactly one consume call', async () => {
      seedReturnTo({ dashboard: 'sales' });
      buildPromoteChecklist.mockResolvedValue([row({ tier: 'chart', type: 'chart', name: 'churn_chart' })]);
      useStore.setState({ promoteExploration: jest.fn().mockResolvedValue(promoteChartResult()) });
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));
      await screen.findByTestId('exploration-promote-return-to-offer');

      const button = screen.getByTestId('exploration-promote-decline-placement');
      // Same reasoning as the accept-path double-click test above: both
      // clicks must land in one `act()` so the second one hits the
      // synchronous `decliningRef` guard instead of a DOM already patched
      // to `disabled`.
      // Both clicks must be batched into ONE act() on purpose: two separate
      // fireEvent.click() calls each flush a render in between, so by the
      // second call the button's own disabled attribute is already patched
      // into the DOM and jsdom swallows the click — that would test the
      // DOM's disabled gating, not the synchronous ref guard this test
      // targets.
      // eslint-disable-next-line testing-library/no-unnecessary-act
      act(() => {
        fireEvent.click(button);
        fireEvent.click(button);
      });

      await waitFor(() =>
        expect(useStore.getState().consumeExplorationReturnTo).toHaveBeenCalledTimes(1)
      );
    });

    // Mirrors the two double-click tests above for the FALLBACK (no
    // return_to) "Add to <dashboard>" placement path — its own
    // `fallbackPlacingRef` guard had no dedicated regression test at all.
    test('rapid double-click on the fallback Add button fires exactly one placement', async () => {
      seedReturnTo(null);
      buildPromoteChecklist.mockResolvedValue([row({ tier: 'chart', type: 'chart', name: 'churn_chart' })]);
      useStore.setState({ promoteExploration: jest.fn().mockResolvedValue(promoteChartResult()) });
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));
      await screen.findByTestId('exploration-promote-fallback-dashboard-offer');

      const button = screen.getByTestId('exploration-promote-fallback-place');
      // Both clicks must be batched into ONE act() on purpose: two separate
      // fireEvent.click() calls each flush a render in between, so by the
      // second call the button's own disabled attribute is already patched
      // into the DOM and jsdom swallows the click — that would test the
      // DOM's disabled gating, not the synchronous ref guard this test
      // targets.
      // eslint-disable-next-line testing-library/no-unnecessary-act
      act(() => {
        fireEvent.click(button);
        fireEvent.click(button);
      });

      await waitFor(() =>
        expect(useStore.getState().placeChartInDashboardSlot).toHaveBeenCalledTimes(1)
      );
    });
  });

  // VIS-1069 — Semantic Layer reciprocal ("View in Semantic Layer").
  describe('View in Semantic Layer', () => {
    const promoteFieldResult = (extra = {}) => ({
      success: true,
      results: [{ type: 'metric', name: 'churn_rate', tier: 'field', success: true, error: null }],
      reclassificationOffers: [],
      ...extra,
    });

    // ux-audit.md "post-promote offers never appear" finding
    // (⚠ conflicts-with-e2e — promote-roundtrip #9): a MODEL is exactly as
    // semantic-layer-visible as a metric/dimension (same ERD), so promoting
    // one — the single most common promote-roundtrip outcome — now offers
    // this too. This is the fix; see the too-narrow-condition note on
    // `promotedField` in the component.
    test('promoting a model (the common case — no metric/dimension involved) also offers "View in Semantic Layer"', async () => {
      buildPromoteChecklist.mockResolvedValue([row()]);
      useStore.setState({
        promoteExploration: jest.fn().mockResolvedValue({
          success: true,
          results: [{ type: 'model', name: 'orders_q', success: true, error: null }],
          reclassificationOffers: [],
        }),
      });
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));
      const offer = await screen.findByTestId('exploration-promote-semantic-layer-offer');
      expect(offer).toHaveTextContent('orders_q');
    });

    test('no offer when only an insight (no model/metric/dimension) was promoted this run', async () => {
      buildPromoteChecklist.mockResolvedValue([row({ tier: 'insight', type: 'insight', name: 'my_insight' })]);
      useStore.setState({
        promoteExploration: jest.fn().mockResolvedValue({
          success: true,
          results: [{ type: 'insight', name: 'my_insight', success: true, error: null }],
          reclassificationOffers: [],
        }),
      });
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));
      await screen.findByTestId('exploration-promote-success');
      expect(
        screen.queryByTestId('exploration-promote-semantic-layer-offer')
      ).not.toBeInTheDocument();
    });

    // P5-D2 — same offer-keys-on-row-success fix as the dashboard offer above.
    test('a partial-failure promote that includes a successfully-promoted field still renders the View-in-Semantic-Layer offer', async () => {
      buildPromoteChecklist.mockResolvedValue([
        row({ tier: 'field', type: 'metric', name: 'churn_rate' }),
        row({ name: 'flaky' }),
      ]);
      useStore.setState({
        promoteExploration: jest.fn().mockResolvedValue({
          success: false,
          results: [
            { type: 'metric', name: 'churn_rate', success: true, error: null },
            { type: 'model', name: 'flaky', success: false, error: 'server rejected it' },
          ],
          reclassificationOffers: [],
        }),
      });
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));

      const offer = await screen.findByTestId('exploration-promote-semantic-layer-offer');
      expect(offer).toHaveTextContent('churn_rate');
      expect(screen.getByTestId('exploration-promote-error')).toHaveTextContent('server rejected it');
    });

    test('a run that publishes BOTH a model and a metric names the METRIC, not the dependency-ordered model', async () => {
      // Composed-gate regression: promote results are dependency-ordered, so a
      // metric's own model is always first. A plain `find()` over "metric,
      // dimension, or model" therefore named the incidental model rather than
      // the field the user just built.
      buildPromoteChecklist.mockResolvedValue([
        row({ tier: 'model', type: 'model', name: 'orders_q' }),
        row({ tier: 'field', type: 'metric', name: 'churn_rate' }),
      ]);
      useStore.setState({
        promoteExploration: jest.fn().mockResolvedValue({
          success: true,
          results: [
            { type: 'model', name: 'orders_q', success: true, error: null },
            { type: 'metric', name: 'churn_rate', success: true, error: null },
          ],
          reclassificationOffers: [],
        }),
      });
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));

      const offer = await screen.findByTestId('exploration-promote-semantic-layer-offer');
      expect(offer).toHaveTextContent('churn_rate');
      expect(offer).not.toHaveTextContent('orders_q');
    });

    test('promoting a metric offers "View in Semantic Layer"; accepting sets the focus intent, opens the tab, and closes', async () => {
      buildPromoteChecklist.mockResolvedValue([row({ tier: 'field', type: 'metric', name: 'churn_rate' })]);
      const setWorkspaceSemanticLayerFocusIntent = jest.fn();
      const openWorkspaceTab = jest.fn();
      useStore.setState({
        promoteExploration: jest.fn().mockResolvedValue(promoteFieldResult()),
        setWorkspaceSemanticLayerFocusIntent,
        openWorkspaceTab,
      });
      const onClose = jest.fn();
      render(<ExplorationPromoteModal explorationId="exp_1" onClose={onClose} />);
      await waitFor(() => expect(screen.getByTestId('exploration-promote-submit')).toBeEnabled());
      fireEvent.click(screen.getByTestId('exploration-promote-submit'));

      const offer = await screen.findByTestId('exploration-promote-semantic-layer-offer');
      expect(offer).toHaveTextContent('churn_rate');

      fireEvent.click(screen.getByTestId('exploration-promote-view-in-semantic-layer'));

      expect(setWorkspaceSemanticLayerFocusIntent).toHaveBeenCalledWith({
        objectKey: 'metric:churn_rate',
      });
      expect(openWorkspaceTab).toHaveBeenCalledWith({
        id: 'semantic-layer:semantic-layer',
        type: 'semantic-layer',
        name: 'semantic-layer',
      });
      expect(onClose).toHaveBeenCalled();
    });
  });
});
