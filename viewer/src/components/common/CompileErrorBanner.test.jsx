import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { futureFlags } from '../../router-config';
import CompileErrorBanner from './CompileErrorBanner';

const renderWithLoaderData = loaderData => {
  const routes = [
    {
      path: '/',
      element: <CompileErrorBanner />,
      loader: () => loaderData,
    },
  ];
  const router = createMemoryRouter(routes, {
    initialEntries: ['/'],
    initialIndex: 0,
    future: futureFlags,
  });
  return render(<RouterProvider router={router} future={futureFlags} />);
};

describe('CompileErrorBanner', () => {
  test('renders nothing when error.json is empty', async () => {
    renderWithLoaderData({});

    // Wait one tick so the router resolves the loader.
    await waitFor(() => {
      expect(screen.queryByTestId('compile-error-banner')).toBeNull();
    });
  });

  test('renders nothing when compile_failed is false', async () => {
    renderWithLoaderData({ compile_failed: false });

    await waitFor(() => {
      expect(screen.queryByTestId('compile-error-banner')).toBeNull();
    });
  });

  test('renders banner when error.json has compile_failed', async () => {
    renderWithLoaderData({
      compile_failed: true,
      summary: '4 validation errors in Project',
      errors: [
        { loc: ['insights', 0, 'props', 'type'], msg: 'Field required', type: 'missing' },
      ],
      compiled_at: '2026-04-29T17:30:00Z',
    });

    await waitFor(() => {
      expect(screen.getByTestId('compile-error-banner')).toBeInTheDocument();
    });
    expect(
      screen.getByText('Project compile failed — last good state shown below')
    ).toBeInTheDocument();
    expect(screen.getByText('4 validation errors in Project')).toBeInTheDocument();
    expect(screen.getByText('insights.0.props.type')).toBeInTheDocument();
    // The "Field required" label should be in the same list item
    expect(screen.getByText(/Field required/)).toBeInTheDocument();
  });

  test('truncates to 5 errors with "and N more"', async () => {
    renderWithLoaderData({
      compile_failed: true,
      summary: '7 validation errors in Project',
      errors: Array.from({ length: 7 }, (_, i) => ({
        loc: ['insights', i, 'props', 'type'],
        msg: 'Field required',
        type: 'missing',
      })),
    });

    await waitFor(() => {
      expect(screen.getByTestId('compile-error-banner')).toBeInTheDocument();
    });

    // 5 visible items + 1 hidden-count line
    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(5);

    expect(screen.getByText(/and 2 more/)).toBeInTheDocument();
    expect(screen.getByText(/See terminal for full list/)).toBeInTheDocument();
  });

  test('shows file:line when present', async () => {
    renderWithLoaderData({
      compile_failed: true,
      summary: '1 validation errors in Project',
      errors: [
        {
          loc: ['insights', 0, 'props', 'type'],
          msg: 'Field required',
          type: 'missing',
          file: '/abs/path/to/project.visivo.yml',
          line: 22,
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByTestId('compile-error-banner')).toBeInTheDocument();
    });
    // Only the basename should render to keep the banner readable.
    expect(screen.getByText(/\(project\.visivo\.yml:22\)/)).toBeInTheDocument();
  });

  test('strips "Value error, " prefix from Pydantic messages', async () => {
    renderWithLoaderData({
      compile_failed: true,
      summary: '1 validation errors in Project',
      errors: [
        {
          loc: ['insights', 0],
          msg: 'Value error, `model` is not a field on Insight.',
          type: 'value_error',
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByTestId('compile-error-banner')).toBeInTheDocument();
    });

    expect(screen.getByText(/`model` is not a field on Insight\./)).toBeInTheDocument();
    expect(screen.queryByText(/^Value error,/)).toBeNull();
  });

  test('renders nothing when loader returns null', async () => {
    renderWithLoaderData(null);

    await waitFor(() => {
      expect(screen.queryByTestId('compile-error-banner')).toBeNull();
    });
  });
});
