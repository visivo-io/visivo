import { render, screen } from '@testing-library/react';
import Home from './Home';
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
const loadError = () => {
  return { message: "Error Message" }
}

const routes = [
  {
    path: "/",
    element: <Home />,
    loader: loadError
  },
];

const router = createMemoryRouter(routes, {
  initialEntries: ["/"],
  initialIndex: 0,
});

test('renders error message', async () => {
  render(<RouterProvider router={router} />);

  expect(screen.getByText('Error Message')).toBeInTheDocument();
});