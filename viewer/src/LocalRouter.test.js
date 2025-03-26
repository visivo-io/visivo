import { render } from '@testing-library/react';
import Viewer from './Viewer';
import { RouterProvider } from 'react-router-dom'

test('renders Visivo dashboard', () => {
  render(<RouterProvider router={Viewer} />);
});
