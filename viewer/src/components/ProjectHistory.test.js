import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import ProjectHistory from './ProjectHistory';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryProvider } from '../contexts/QueryContext'
const queryClient = new QueryClient()

const loadProject = () => {
    return { created_at: "2024-08-07T13:07:34Z", id: "1" }
}

const routes = [
    {
        path: "/:project",
        element: <ProjectHistory />,
        id: 'project',
        loader: loadProject
    },
];

let projects
const fetchProjectHistoryQuery = (projectId) => ({
    queryKey: ['project_history', projectId],
    queryFn: () => projects,
})

const router = createMemoryRouter(routes, {
    initialEntries: ["/project"],
    initialIndex: 0,
});

test('renders date', async () => {
    projects = [{ id: 1, created_at: '2024-01-01' }]
    render(
        <QueryClientProvider client={queryClient}>
            <QueryProvider value={{ fetchProjectHistoryQuery }}>
                <RouterProvider router={router} />
            </QueryProvider>
        </QueryClientProvider>
    );

    await waitFor(() => {
        expect(screen.getByTestId('project-history')).toBeInTheDocument();
    })
    expect(screen.queryByText('Invalid Date')).not.toBeInTheDocument();
});

test('renders date selection', async () => {
    projects = [{ id: 1, created_at: '2024-01-01' }, { id: 2, created_at: '2024-01-02' }]
    render(
        <QueryClientProvider client={queryClient}>
            <QueryProvider value={{ fetchProjectHistoryQuery }}>
                <RouterProvider router={router} />
            </QueryProvider>
        </QueryClientProvider>
    );

    await waitFor(() => {
        expect(screen.getByTestId('project-history-select')).toBeInTheDocument();
    })
    expect(screen.queryByText('Invalid Date')).not.toBeInTheDocument();
});