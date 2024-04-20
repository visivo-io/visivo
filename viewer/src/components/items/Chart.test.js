import { screen, waitFor } from '@testing-library/react';
import Chart from './Chart';
import { renderWithProviders } from '../../utils/test-utils';
let chart;

beforeEach(() => {
  chart = { name: "name", traces: [] }
});


test('renders chart', async () => {
  renderWithProviders(<Chart chart={chart} project={{ id: 1 }} />);

  await waitFor(() => {
    expect(screen.getByText('Mock Plot')).toBeInTheDocument();
  });
});
