import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import ProjectHistory from './ProjectHistory';

const loadProject = () => {
    return { created_at: "2024-08-07T13:07:34Z" }
}

const routes = [
    {
        path: "/:project",
        element: <ProjectHistory />,
        id: 'project',
        loader: loadProject
    },
];

const router = createMemoryRouter(routes, {
    initialEntries: ["/project"],
    initialIndex: 0,
});

test('renders date', async () => {
    render(<RouterProvider router={router} />);

    expect(screen.getByTestId('project-history')).toBeInTheDocument();
    expect(screen.queryByText('Invalid Date')).not.toBeInTheDocument();
});