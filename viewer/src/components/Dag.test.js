import { render, screen } from '@testing-library/react';
import Dag from './Dag';
import { createMemoryRouter, RouterProvider } from 'react-router-dom'

const getDag = () => {
  return null
};

const routes = [
  {
    path: "/:project",
    element: <Dag />,
    id: 'project',
    loader: getDag
  },
];

const router = createMemoryRouter(routes, {
  initialEntries: ["/project"],
  initialIndex: 0,
});

test('renders the input fields', async () => {
  render(<RouterProvider router={router} />);

  const text = await screen.findByPlaceholderText("Filter by node name");
  expect(text).toBeInTheDocument();
})