/**
 * SaveStateIndicator tests (VIS-802 / Track G G-1).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import SaveStateIndicator from './SaveStateIndicator';

describe('SaveStateIndicator (VIS-802)', () => {
  test('renders nothing when idle', () => {
    const { container } = render(<SaveStateIndicator status="idle" />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing for an unknown status', () => {
    const { container } = render(<SaveStateIndicator status="whatever" />);
    expect(container).toBeEmptyDOMElement();
  });

  test.each([
    ['pending', 'Unsaved'],
    ['saving', 'Saving'],
    ['saved', 'Saved'],
    ['error', 'Save failed'],
    // VIS-993: the validation gate holds persistence of an invalid config —
    // the indicator must say so (same status the useRecordSave backbone reports).
    ['invalid', 'Invalid'],
  ])('renders the %s state label', (status, label) => {
    render(<SaveStateIndicator status={status} />);
    const badge = screen.getByTestId('right-rail-save-state');
    expect(badge).toHaveAttribute('data-status', status);
    expect(badge).toHaveTextContent(label);
  });

  test.each([['error'], ['invalid']])(
    '%s uses the highlight tone (never the primary/mulberry palette)',
    status => {
      render(<SaveStateIndicator status={status} />);
      const badge = screen.getByTestId('right-rail-save-state');
      // Highlight orange-red, not mulberry/primary.
      expect(badge.className).toContain('text-[#d25946]');
      expect(badge.className).not.toContain('713b57');
    }
  );
});
