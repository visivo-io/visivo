import { render, screen } from '@testing-library/react';
import Error from './Error';

// M15: a parse error used to render as a `fixed` overlay at the same z-50 as
// TopNav but later in the DOM, so paint order made the opaque banner win —
// sitting exactly over Commit / Deploy / New object / the tab strip and
// swallowing their clicks. The banner must stay in flow, below the nav's
// stacking level, with a bounded height.
describe('Error banner (M15 click interception)', () => {
  test('renders its message', () => {
    render(<Error>1 validation error in Project</Error>);
    expect(screen.getByText('1 validation error in Project')).toBeInTheDocument();
  });

  test('is never a fixed overlay at the nav z-level', () => {
    render(<Error>boom</Error>);
    const banner = screen.getByRole('alert');
    expect(banner.className).not.toContain('fixed');
    expect(banner.className).not.toContain('z-50');
    expect(banner.className).toContain('sticky');
    expect(banner.className).toContain('z-40');
  });

  test('has a bounded, scrollable height (a 470px traceback must not grow unbounded)', () => {
    render(<Error>{'long\n'.repeat(200)}</Error>);
    const banner = screen.getByRole('alert');
    expect(banner.className).toContain('max-h-48');
    expect(banner.className).toContain('overflow-y-auto');
  });
});
