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

  describe('long labels must truncate, never push trailing controls out of the row', () => {
    // Regression: Explore 2.0 Phase 6c-T3's live auto-rename replaced the
    // placeholder name `model` with a real one like `local-duckdb_query`. In
    // PropertyRow's pill+SliceBadge row that longer label grew the pill past
    // the available width instead of ellipsizing, pushing the `extra` slot
    // (PillMenu's chevron trigger) underneath the adjacent SliceBadge, where
    // it could not be clicked — caught by exploration-build-rail.spec.mjs's
    // slice-preset story.
    //
    // The cause is CSS, not JS: a flex item defaults to `min-width: auto` and
    // refuses to shrink below its content's intrinsic width, so `truncate`
    // (overflow-hidden + ellipsis) never gets a chance to engage. Every level
    // of the chain has to opt out.
    //
    // jsdom does no layout, so these assert the CLASS CONTRACT that produces
    // the behaviour rather than measured geometry — the e2e story above is
    // what proves the pixels. Stated plainly because a class assertion that
    // silently stops matching the real mechanism is worse than no test.
    const LONG = 'local-duckdb_query_with_a_very_long_generated_name';

    test('the outer pill can shrink and is bounded by its container', () => {
      render(<FieldPill type="model" name={LONG} label={LONG} data-testid="fp" />);
      const pill = screen.getByTestId('fp');
      expect(pill).toHaveClass('min-w-0');
      expect(pill).toHaveClass('max-w-full');
    });

    test('the label claims remaining space, may shrink below its text, and truncates', () => {
      render(<FieldPill type="model" name={LONG} label={LONG} data-testid="fp" />);
      const label = screen.getByText(LONG);
      expect(label).toHaveClass('truncate');
      // Without BOTH of these, `truncate` is inert on a flex child.
      expect(label).toHaveClass('min-w-0');
      expect(label).toHaveClass('flex-1');
    });

    test('the extra slot never shrinks, so a long label cannot squeeze the chevron away', () => {
      render(
        <FieldPill
          type="model"
          name={LONG}
          label={LONG}
          data-testid="fp"
          extra={<button data-testid="chev">v</button>}
        />
      );
      const chevron = screen.getByTestId('chev');
      expect(chevron.parentElement).toHaveClass('shrink-0');
      // And it is still a sibling of the label, not nested inside it.
      expect(screen.getByText(LONG).contains(chevron)).toBe(false);
    });
  });
});
