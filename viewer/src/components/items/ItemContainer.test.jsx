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

  it('carries its card edge on the border, with no resting shadow', () => {
    // shadow-lg put a 10px-offset smear under every item, which on a light
    // page reads as a dark band along the bottom rather than as depth.
    const { container } = render(
      <ItemContainer>
        <div>child</div>
      </ItemContainer>
    );
    // eslint-disable-next-line testing-library/no-node-access
    const root = container.firstChild;
    expect(root.className).toMatch(/\brounded-lg\b/);
    expect(root.className).toMatch(/\bborder\b/);
    expect(root.className).toMatch(/\boverflow-hidden\b/);
    expect(root.className).not.toMatch(/(?<!hover:)\bshadow-/);
  });

  it('raises a shadow on hover, which the old styling only claimed to', () => {
    // Its hover class was the same shadow-lg as the resting state, so hovering
    // changed nothing.
    const { container } = render(
      <ItemContainer>
        <div>child</div>
      </ItemContainer>
    );
    // eslint-disable-next-line testing-library/no-node-access
    const root = container.firstChild;
    expect(root.className).toMatch(/\bhover:shadow-md\b/);
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
