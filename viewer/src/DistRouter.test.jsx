import React from 'react';
import { render } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import DistRouter from './DistRouter';
import { futureFlags } from './router-config';

test('renders Visivo dist router', () => {
  render(<RouterProvider router={DistRouter} future={futureFlags} />);
});
