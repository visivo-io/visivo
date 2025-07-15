import { render, screen } from '@testing-library/react';
import Breadcrumbs from './Breadcrumbs';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { futureFlags } from '../../router-config';

test('renders dashboard chart', async () => {
  const routes = [
    {
      path: '/:parent',
      element: <Breadcrumbs />,
      handle: {
        crumb: () => 'Parent',
      },
      children: [
        {
          path: ':child',
          element: <Breadcrumbs />,
          handle: {
            crumb: () => 'Child',
          },
        },
      ],
    },
  ];

  const router = createMemoryRouter(routes, {
    initialEntries: ['/', '/crumb/child'],
    initialIndex: 1,
    future: futureFlags,
  });

  render(<RouterProvider router={router} future={futureFlags} />);

  expect(screen.getByTestId('breadcrumbs').textContent).toEqual('Parent / Child');
});
