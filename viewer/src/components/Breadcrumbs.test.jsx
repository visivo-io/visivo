import { render, screen } from '@testing-library/react';
import Breadcrumbs from './Breadcrumbs';
import { createMemoryRouter, RouterProvider } from 'react-router-dom'



test('renders dashboard chart', async () => {
  const routes = [
    {
      path: "/:parent",
      element: <Breadcrumbs />,
      handle: {
        crumb: () => "Parent"
      },
      children: [{
        path: ":child",
        element: <Breadcrumbs />,
        handle: {
          crumb: () => "Child"
        },
      }]
    },
  ];

  const router = createMemoryRouter(routes, {
    initialEntries: ["/", "/crumb/child"],
    initialIndex: 1,
  });

  render(<RouterProvider router={router} />);

  expect(screen.getByTestId('breadcrumbs').textContent).toEqual('Parent / Child');
});
