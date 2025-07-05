import React from 'react';
import { render } from '@testing-library/react';
import MenuContainer from './MenuContainer';
import Menu from './Menu';

describe('MenuContainer', () => {
  it('renders children correctly', () => {
    const { getByText } = render(
      <MenuContainer>
        <Menu>Menu 1</Menu>
        <Menu>Menu 2</Menu>
      </MenuContainer>
    );

    expect(getByText('Menu 1')).toBeInTheDocument();
    expect(getByText('Menu 2')).toBeInTheDocument();
  });
});
