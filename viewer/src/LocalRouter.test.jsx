import { render } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import LocalRouter from './LocalRouter';
import { futureFlags } from './router-config';

test('renders Visivo local router', () => {
  render(<RouterProvider router={LocalRouter} future={futureFlags} />);
});
