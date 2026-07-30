/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FieldSwapOfferBanner from './FieldSwapOfferBanner';
import useStore from '../../../stores/store';

// VIS-1095: every offer slot now carries `previousRef`/`previousColumn`/
// `previousAgg` — the snapshot `applyOffer` re-validates against the slot's
// CURRENT live value at accept-time. Defaults here describe a slot bound to
// `${ref(other_model).amount}` (a bare dimension ref, no aggregate).
const offer = (overrides = {}) => ({
  promotedType: 'metric',
  promotedName: 'total_amount',
  slots: [
    {
      insightName: 'other_chart',
      location: 'prop',
      key: 'y',
      previousRef: 'other_model',
      previousColumn: 'amount',
      previousAgg: null,
      swapTo: { kind: 'metricRef', ref: 'total_amount' },
    },
  ],
  ...overrides,
});

// The live `explorerInsightStates` matching `offer()`'s default slot
// UNCHANGED — most tests want the "still matches, apply proceeds" case.
const UNCHANGED_INSIGHT_STATES = {
  other_chart: { props: { y: '?{${ref(other_model).amount}}' }, interactions: [] },
};

beforeEach(() => {
  useStore.setState({
    setInsightProp: jest.fn(),
    updateInsightInteraction: jest.fn(),
    showWorkspaceToast: jest.fn(),
    explorerInsightStates: UNCHANGED_INSIGHT_STATES,
  });
});

describe('FieldSwapOfferBanner', () => {
  test('renders nothing for an empty offers list', () => {
    const { container } = render(<FieldSwapOfferBanner offers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing when the offers prop is omitted entirely (defaults to [])', () => {
    const { container } = render(<FieldSwapOfferBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders one banner per offer, naming the promoted field and slot count', () => {
    render(<FieldSwapOfferBanner offers={[offer()]} />);
    expect(screen.getByTestId('field-swap-offer-total_amount')).toHaveTextContent('total_amount');
    expect(screen.getByTestId('field-swap-offer-total_amount')).toHaveTextContent('1 other reference');
  });

  test('pluralizes for multiple slots', () => {
    render(
      <FieldSwapOfferBanner
        offers={[
          offer({
            slots: [
              { insightName: 'a', location: 'prop', key: 'y', swapTo: { kind: 'metricRef', ref: 'total_amount' } },
              { insightName: 'b', location: 'prop', key: 'y2', swapTo: { kind: 'metricRef', ref: 'total_amount' } },
            ],
          }),
        ]}
      />
    );
    expect(screen.getByText('Update 2 references')).toBeInTheDocument();
  });

  test('clicking Apply rewrites every affected PROP slot via setInsightProp with the serialized ref', () => {
    const setInsightProp = jest.fn();
    useStore.setState({ setInsightProp });
    render(<FieldSwapOfferBanner offers={[offer()]} onDismiss={jest.fn()} />);
    fireEvent.click(screen.getByTestId('field-swap-offer-total_amount-apply'));
    expect(setInsightProp).toHaveBeenCalledWith('other_chart', 'y', '?{${ref(total_amount)}}');
  });

  test('clicking Apply rewrites an affected INTERACTION slot via updateInsightInteraction', () => {
    const updateInsightInteraction = jest.fn();
    useStore.setState({
      updateInsightInteraction,
      explorerInsightStates: {
        a: { props: {}, interactions: [{ type: 'filter', value: '?{${ref(orders_q).region}}' }] },
      },
    });
    render(
      <FieldSwapOfferBanner
        offers={[
          offer({
            slots: [
              {
                insightName: 'a',
                location: 'interaction',
                key: 0,
                previousRef: 'orders_q',
                previousColumn: 'region',
                previousAgg: null,
                swapTo: { kind: 'dimensionRef', ref: 'region' },
              },
            ],
          }),
        ]}
        onDismiss={jest.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('field-swap-offer-total_amount-apply'));
    expect(updateInsightInteraction).toHaveBeenCalledWith('a', 0, { value: '?{${ref(region)}}' });
  });

  test('a slot with neither a "prop" nor "interaction" location is silently skipped — no write call is made for it', () => {
    // Forward/backward-compat guard: a slot shape from an older/newer
    // build that doesn't match either known `location` is simply not
    // written anywhere, rather than throwing or defaulting to one.
    const setInsightProp = jest.fn();
    const updateInsightInteraction = jest.fn();
    useStore.setState({
      setInsightProp,
      updateInsightInteraction,
      explorerInsightStates: {
        a: { props: {}, interactions: [{ type: 'filter', value: '?{${ref(orders_q).region}}' }] },
      },
    });
    render(
      <FieldSwapOfferBanner
        offers={[
          offer({
            slots: [
              {
                insightName: 'a',
                location: 'unknown',
                key: 0,
                previousRef: 'orders_q',
                previousColumn: 'region',
                previousAgg: null,
                swapTo: { kind: 'dimensionRef', ref: 'region' },
              },
            ],
          }),
        ]}
        onDismiss={jest.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('field-swap-offer-total_amount-apply'));
    expect(setInsightProp).not.toHaveBeenCalled();
    expect(updateInsightInteraction).not.toHaveBeenCalled();
  });

  test('Apply calls onDismiss with the offer index (one-click, then gone)', () => {
    const onDismiss = jest.fn();
    render(<FieldSwapOfferBanner offers={[offer()]} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId('field-swap-offer-total_amount-apply'));
    expect(onDismiss).toHaveBeenCalledWith(0);
  });

  test('the icon-only "×" dismiss button (distinct from the text "Dismiss" button) also dismisses', () => {
    const setInsightProp = jest.fn();
    const onDismiss = jest.fn();
    useStore.setState({ setInsightProp });
    render(<FieldSwapOfferBanner offers={[offer()]} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(setInsightProp).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledWith(0);
  });

  test('Dismiss never touches the store — never a silent apply', () => {
    const setInsightProp = jest.fn();
    const onDismiss = jest.fn();
    useStore.setState({ setInsightProp });
    render(<FieldSwapOfferBanner offers={[offer()]} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId('field-swap-offer-total_amount-dismiss'));
    expect(setInsightProp).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledWith(0);
  });

  // VIS-1095 — accept-time re-validation: the offer's captured slot snapshot
  // is re-checked against the CURRENT live value right before writing.
  describe('accept-time re-validation (VIS-1095)', () => {
    test('a slot hand-edited to a DIFFERENT column since the offer was made is skipped, not overwritten', () => {
      const setInsightProp = jest.fn();
      const showWorkspaceToast = jest.fn();
      useStore.setState({
        setInsightProp,
        showWorkspaceToast,
        // The user retyped the pill to a DIFFERENT column underneath the
        // (non-modal) banner between offer-creation and clicking Apply.
        explorerInsightStates: {
          other_chart: { props: { y: '?{${ref(other_model).total_revenue}}' }, interactions: [] },
        },
      });
      render(<FieldSwapOfferBanner offers={[offer()]} onDismiss={jest.fn()} />);
      fireEvent.click(screen.getByTestId('field-swap-offer-total_amount-apply'));
      expect(setInsightProp).not.toHaveBeenCalled();
      expect(showWorkspaceToast).toHaveBeenCalledWith(expect.stringContaining('changed'));
    });

    test('a slot whose insight was renamed/removed since the offer was made is skipped, not overwritten', () => {
      const setInsightProp = jest.fn();
      const showWorkspaceToast = jest.fn();
      useStore.setState({
        setInsightProp,
        showWorkspaceToast,
        explorerInsightStates: {}, // other_chart no longer exists
      });
      render(<FieldSwapOfferBanner offers={[offer()]} onDismiss={jest.fn()} />);
      fireEvent.click(screen.getByTestId('field-swap-offer-total_amount-apply'));
      expect(setInsightProp).not.toHaveBeenCalled();
      expect(showWorkspaceToast).toHaveBeenCalledWith(expect.stringContaining('changed'));
    });

    test('a slot that still matches applies normally with no toast', () => {
      const setInsightProp = jest.fn();
      const showWorkspaceToast = jest.fn();
      useStore.setState({ setInsightProp, showWorkspaceToast });
      render(<FieldSwapOfferBanner offers={[offer()]} onDismiss={jest.fn()} />);
      fireEvent.click(screen.getByTestId('field-swap-offer-total_amount-apply'));
      expect(setInsightProp).toHaveBeenCalledWith('other_chart', 'y', '?{${ref(total_amount)}}');
      expect(showWorkspaceToast).not.toHaveBeenCalled();
    });

    test('a mixed offer applies the unchanged slots and skips only the changed one, with a partial-success toast', () => {
      const setInsightProp = jest.fn();
      const showWorkspaceToast = jest.fn();
      useStore.setState({
        setInsightProp,
        showWorkspaceToast,
        explorerInsightStates: {
          unchanged_chart: { props: { y: '?{${ref(other_model).amount}}' }, interactions: [] },
          // changed_chart's slot now points at a DIFFERENT ref entirely.
          changed_chart: { props: { y: '?{${ref(different_model).amount}}' }, interactions: [] },
        },
      });
      render(
        <FieldSwapOfferBanner
          offers={[
            offer({
              slots: [
                {
                  insightName: 'unchanged_chart',
                  location: 'prop',
                  key: 'y',
                  previousRef: 'other_model',
                  previousColumn: 'amount',
                  previousAgg: null,
                  swapTo: { kind: 'metricRef', ref: 'total_amount' },
                },
                {
                  insightName: 'changed_chart',
                  location: 'prop',
                  key: 'y',
                  previousRef: 'other_model',
                  previousColumn: 'amount',
                  previousAgg: null,
                  swapTo: { kind: 'metricRef', ref: 'total_amount' },
                },
              ],
            }),
          ]}
          onDismiss={jest.fn()}
        />
      );
      fireEvent.click(screen.getByTestId('field-swap-offer-total_amount-apply'));
      expect(setInsightProp).toHaveBeenCalledTimes(1);
      expect(setInsightProp).toHaveBeenCalledWith(
        'unchanged_chart',
        'y',
        '?{${ref(total_amount)}}'
      );
      expect(showWorkspaceToast).toHaveBeenCalledWith(expect.stringContaining('Updated 1'));
    });

    test('pluralizes the skip-toast grammar ("were skipped") when 2+ slots are skipped alongside an applied one', () => {
      const setInsightProp = jest.fn();
      const showWorkspaceToast = jest.fn();
      useStore.setState({
        setInsightProp,
        showWorkspaceToast,
        explorerInsightStates: {
          unchanged_chart: { props: { y: '?{${ref(other_model).amount}}' }, interactions: [] },
          changed_chart_1: { props: { y: '?{${ref(different_model).amount}}' }, interactions: [] },
          changed_chart_2: { props: { y: '?{${ref(different_model).amount}}' }, interactions: [] },
        },
      });
      const slotFor = insightName => ({
        insightName,
        location: 'prop',
        key: 'y',
        previousRef: 'other_model',
        previousColumn: 'amount',
        previousAgg: null,
        swapTo: { kind: 'metricRef', ref: 'total_amount' },
      });
      render(
        <FieldSwapOfferBanner
          offers={[
            offer({
              slots: [
                slotFor('unchanged_chart'),
                slotFor('changed_chart_1'),
                slotFor('changed_chart_2'),
              ],
            }),
          ]}
          onDismiss={jest.fn()}
        />
      );
      fireEvent.click(screen.getByTestId('field-swap-offer-total_amount-apply'));
      expect(setInsightProp).toHaveBeenCalledTimes(1);
      expect(showWorkspaceToast).toHaveBeenCalledWith(
        expect.stringContaining('Updated 1 — 2 references changed since this offer was made and were skipped')
      );
    });

    test('still dismisses the offer even when every slot was skipped (no lingering stale offer)', () => {
      const onDismiss = jest.fn();
      useStore.setState({ explorerInsightStates: {} });
      render(<FieldSwapOfferBanner offers={[offer()]} onDismiss={onDismiss} />);
      fireEvent.click(screen.getByTestId('field-swap-offer-total_amount-apply'));
      expect(onDismiss).toHaveBeenCalledWith(0);
    });
  });
});
