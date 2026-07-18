/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FieldSwapOfferBanner from './FieldSwapOfferBanner';
import useStore from '../../../stores/store';

const offer = (overrides = {}) => ({
  promotedType: 'metric',
  promotedName: 'total_amount',
  slots: [{ insightName: 'other_chart', location: 'prop', key: 'y', swapTo: { kind: 'metricRef', ref: 'total_amount' } }],
  ...overrides,
});

beforeEach(() => {
  useStore.setState({
    setInsightProp: jest.fn(),
    updateInsightInteraction: jest.fn(),
  });
});

describe('FieldSwapOfferBanner', () => {
  test('renders nothing for an empty offers list', () => {
    const { container } = render(<FieldSwapOfferBanner offers={[]} />);
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
    useStore.setState({ updateInsightInteraction });
    render(
      <FieldSwapOfferBanner
        offers={[
          offer({
            slots: [
              { insightName: 'a', location: 'interaction', key: 0, swapTo: { kind: 'dimensionRef', ref: 'region' } },
            ],
          }),
        ]}
        onDismiss={jest.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('field-swap-offer-total_amount-apply'));
    expect(updateInsightInteraction).toHaveBeenCalledWith('a', 0, { value: '?{${ref(region)}}' });
  });

  test('Apply calls onDismiss with the offer index (one-click, then gone)', () => {
    const onDismiss = jest.fn();
    render(<FieldSwapOfferBanner offers={[offer()]} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId('field-swap-offer-total_amount-apply'));
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
});
