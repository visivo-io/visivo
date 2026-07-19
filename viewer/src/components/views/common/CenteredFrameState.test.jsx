import React from 'react';
import { render, screen } from '@testing-library/react';
import CenteredFrameState from './CenteredFrameState';

const Icon = props => <svg data-testid="frame-state-icon" {...props} />;

describe('CenteredFrameState', () => {
  test('renders the testId, title, and body', () => {
    render(<CenteredFrameState testId="my-state" title="Nothing here" body="Come back later." />);
    expect(screen.getByTestId('my-state')).toBeInTheDocument();
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByText('Come back later.')).toBeInTheDocument();
  });

  test('renders no icon by default (matches the original ErdEmptyState, text-only)', () => {
    render(<CenteredFrameState testId="my-state" title="Nothing here" />);
    expect(screen.queryByTestId('frame-state-icon')).not.toBeInTheDocument();
  });

  test('exposes a stable "<testId>-card" testid for the inner card', () => {
    render(<CenteredFrameState testId="my-state" title="Nothing here" />);
    expect(screen.getByTestId('my-state-card')).toBeInTheDocument();
  });

  test('renders the given icon, without spin by default', () => {
    render(<CenteredFrameState testId="my-state" title="Nothing here" icon={Icon} />);
    const icon = screen.getByTestId('frame-state-icon');
    expect(icon).toBeInTheDocument();
    // SVG elements expose `className` as an SVGAnimatedString, not a plain
    // string, in jsdom — read the attribute directly instead.
    expect(icon.getAttribute('class')).not.toContain('animate-spin');
  });

  test('spin adds animate-spin to the icon', () => {
    render(<CenteredFrameState testId="my-state" title="Loading…" icon={Icon} spin />);
    expect(screen.getByTestId('frame-state-icon').getAttribute('class')).toContain('animate-spin');
  });

  test('omits the body paragraph entirely when none is given', () => {
    render(<CenteredFrameState testId="my-state" title="Nothing here" />);
    expect(screen.queryByText(/./, { selector: 'p' })).not.toBeInTheDocument();
  });

  test('maxWidth defaults to 420px and is overridable', () => {
    const { rerender } = render(<CenteredFrameState testId="my-state" title="x" />);
    expect(screen.getByTestId('my-state-card')).toHaveStyle({ maxWidth: '420px' });

    rerender(<CenteredFrameState testId="my-state" title="x" maxWidth={360} />);
    expect(screen.getByTestId('my-state-card')).toHaveStyle({ maxWidth: '360px' });
  });
});
