import React from 'react';
import { render, screen } from '@testing-library/react';
import Iframe from './Iframe';

test('renders iframe with provided url', () => {
  render(<Iframe url="https://example.com" height={300} />);
  const iframe = screen.getByTitle('https://example.com');
  expect(iframe).toBeInTheDocument();
  expect(iframe).toHaveAttribute('src', 'https://example.com');
});
