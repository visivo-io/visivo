import React from 'react';
import { render, screen } from '@testing-library/react';
import { ItemContainer } from './ItemContainer';

// B15: ItemContainer must fill its parent item div so 2.0 widgets
// (notably the new table) don't shrink to content or overflow without a
// scrollbar. The fix is `w-full h-full` in the tw template literal.
describe('ItemContainer (B15 sizing)', () => {
  it('renders with w-full and h-full classes', () => {
    const { container } = render(
      <ItemContainer>
        <div>child</div>
      </ItemContainer>
    );
    // eslint-disable-next-line testing-library/no-node-access
    const root = container.firstChild;
    expect(root.className).toMatch(/\bw-full\b/);
    expect(root.className).toMatch(/\bh-full\b/);
  });

  it('still has the visual-style classes from before', () => {
    const { container } = render(
      <ItemContainer>
        <div>child</div>
      </ItemContainer>
    );
    // eslint-disable-next-line testing-library/no-node-access
    const root = container.firstChild;
    expect(root.className).toMatch(/\brounded-2xl\b/);
    expect(root.className).toMatch(/\bshadow-lg\b/);
    expect(root.className).toMatch(/\boverflow-hidden\b/);
  });

  it('renders children', () => {
    render(
      <ItemContainer>
        <div>hello world</div>
      </ItemContainer>
    );
    expect(screen.getByText('hello world')).toBeInTheDocument();
  });
});
