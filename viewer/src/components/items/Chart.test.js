import { render, screen, waitFor } from '@testing-library/react';
import Chart from './Chart';
import { FetchTraceQueryProvider } from '../../contexts/FetchTraceQueryContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
let chart;

beforeEach(() => {
  chart = { name: "name", traces: [] }
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
})

test('renders chart', async () => {
  const fetchTraceQuery = (projectId, name) => ({
    queryKey: ['trace', projectId, name],
    queryFn: async () => [],
  })

  render(
    <FetchTraceQueryProvider value={fetchTraceQuery}>
      <QueryClientProvider client={queryClient}>
        <Chart chart={chart} project={{ id: 1 }} />
      </QueryClientProvider>
    </FetchTraceQueryProvider>
  );

  await waitFor(() => {
    expect(screen.getByText('Mock Plot')).toBeInTheDocument();
  });
});
