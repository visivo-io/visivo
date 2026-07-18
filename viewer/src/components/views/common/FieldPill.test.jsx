/**
 * FieldPill — the app's shared field/column pill.
 *
 * Asserts the pill pulls its icon + colors from the canonical objectTypeConfigs
 * (so every "field" surface looks identical), renders as the requested tag for
 * draggable use, and slots trailing controls via `extra`.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import FieldPill from './FieldPill';
import { getTypeColors } from './objectTypeConfigs';

describe('FieldPill (shared field/column pill)', () => {
  test('renders the label with the type palette from objectTypeConfigs', () => {
    render(<FieldPill type="dimension" name="region" label="Region" data-testid="fp" />);
    const pill = screen.getByTestId('fp');
    expect(pill).toHaveTextContent('Region');
    // Colors come from the shared config — never hand-rolled per component.
    const { bg, text, border } = getTypeColors('dimension');
    expect(pill).toHaveClass(bg);
    expect(pill).toHaveClass(text);
    expect(pill).toHaveClass(border);
  });

  test('different types pull different palettes (dimension vs metric)', () => {
    const { rerender } = render(<FieldPill type="dimension" name="a" data-testid="fp" />);
    expect(screen.getByTestId('fp')).toHaveClass(getTypeColors('dimension').bg);
    rerender(<FieldPill type="metric" name="a" data-testid="fp" />);
    expect(screen.getByTestId('fp')).toHaveClass(getTypeColors('metric').bg);
  });

  test('falls back to name when no label is given', () => {
    render(<FieldPill type="metric" name="revenue" data-testid="fp" />);
    expect(screen.getByTestId('fp')).toHaveTextContent('revenue');
  });

  test('renders as the requested tag (e.g. a draggable button)', () => {
    render(<FieldPill as="button" type="dimension" name="region" data-testid="fp" />);
    expect(screen.getByTestId('fp').tagName).toBe('BUTTON');
  });

  test('renders trailing controls via the extra slot', () => {
    render(
      <FieldPill
        type="metric"
        name="revenue"
        data-testid="fp"
        extra={<span data-testid="agg">sum</span>}
      />
    );
    expect(screen.getByTestId('agg')).toBeInTheDocument();
  });

  // Delta-review fix (HIGH, e2e-gap-review): a dangling ref must render as an
  // explicit warning pill, never the type's normal (healthy-looking) palette.
  describe('warning (dangling-ref) state', () => {
    test('overrides the type palette with the highlight warning treatment', () => {
      render(<FieldPill type="dimension" name="orders_q" label="orders_q ▸ region" warning data-testid="fp" />);
      const pill = screen.getByTestId('fp');
      const { bg, text } = getTypeColors('dimension');
      expect(pill).not.toHaveClass(bg);
      expect(pill).not.toHaveClass(text);
      expect(pill).toHaveAttribute('data-warning', 'true');
      expect(screen.getByTestId('field-pill-warning-icon')).toBeInTheDocument();
    });

    test('warningMessage becomes the tooltip', () => {
      render(
        <FieldPill
          type="dimension"
          name="orders_q"
          warning
          warningMessage="orders_q no longer exists"
          data-testid="fp"
        />
      );
      expect(screen.getByTestId('fp')).toHaveAttribute('title', 'orders_q no longer exists');
    });

    test('a non-warning pill never carries the warning attribute or icon', () => {
      render(<FieldPill type="dimension" name="orders_q" data-testid="fp" />);
      expect(screen.getByTestId('fp')).not.toHaveAttribute('data-warning');
      expect(screen.queryByTestId('field-pill-warning-icon')).not.toBeInTheDocument();
    });
  });
});
