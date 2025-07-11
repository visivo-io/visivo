import React from 'react';
import { render, screen } from '@testing-library/react';
import MenuContainer from './MenuContainer';
import Menu from './Menu';

describe('MenuContainer', () => {
  it('renders children correctly', () => {
    render(
      <MenuContainer>
        <Menu>Menu 1</Menu>
        <Menu>Menu 2</Menu>
      </MenuContainer>
    );

    expect(screen.getByText('Menu 1')).toBeInTheDocument();
    expect(screen.getByText('Menu 2')).toBeInTheDocument();
  });
});
