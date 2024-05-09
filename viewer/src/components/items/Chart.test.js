import { render, screen, waitFor } from '@testing-library/react';
import Chart from './Chart';
import { withProviders } from '../../utils/test-utils';
let chart;

beforeEach(() => {
  chart = { name: "name", traces: [] }
});


test('renders chart', async () => {
  render(<Chart chart={chart} project={{ id: 1 }} />, { wrapper: withProviders });

  await waitFor(() => {
    expect(screen.getByText('Mock Plot')).toBeInTheDocument();
  });
});
