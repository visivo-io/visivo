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
});
