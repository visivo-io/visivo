import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SliceBanner } from './SliceBanner';

describe('SliceBanner', () => {
  it('renders the educational copy', () => {
    render(
      <SliceBanner
        onPickFirst={() => {}}
        onPickLast={() => {}}
        onPickCustom={() => {}}
      />
    );
    expect(screen.getByTestId('slice-banner')).toBeInTheDocument();
    expect(screen.getByText(/single value/i)).toBeInTheDocument();
    expect(screen.getByText(/many rows/i)).toBeInTheDocument();
  });

  it('exposes First / Last / Pick row quick actions', () => {
    const onPickFirst = jest.fn();
    const onPickLast = jest.fn();
    const onPickCustom = jest.fn();
    render(
      <SliceBanner
        onPickFirst={onPickFirst}
        onPickLast={onPickLast}
        onPickCustom={onPickCustom}
      />
    );
    fireEvent.click(screen.getByTestId('slice-banner-first'));
    expect(onPickFirst).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('slice-banner-last'));
    expect(onPickLast).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('slice-banner-pick'));
    expect(onPickCustom).toHaveBeenCalled();
  });

  it('renders dismiss button only when onDismiss is provided', () => {
    const onDismiss = jest.fn();
    const { rerender } = render(
      <SliceBanner
        onPickFirst={() => {}}
        onPickLast={() => {}}
        onPickCustom={() => {}}
      />
    );
    expect(screen.queryByTestId('slice-banner-dismiss')).not.toBeInTheDocument();

    rerender(
      <SliceBanner
        onPickFirst={() => {}}
        onPickLast={() => {}}
        onPickCustom={() => {}}
        onDismiss={onDismiss}
      />
    );
    fireEvent.click(screen.getByTestId('slice-banner-dismiss'));
    expect(onDismiss).toHaveBeenCalled();
  });
});
