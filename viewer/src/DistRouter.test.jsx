import { render } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom'
import DistRouter from './DistRouter';

test('renders Visivo dist router', () => {
  render(<RouterProvider router={DistRouter} />);
});
