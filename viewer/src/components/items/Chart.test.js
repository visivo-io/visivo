import { render, screen, waitFor } from '@testing-library/react';
import Chart from './Chart';

let chart;

beforeEach(() => {
  chart = { name: "name", traces: [] }
});

test('renders chart', async () => {
  render(<Chart chart={chart} />);

  await waitFor(() => {
    expect(screen.getByText('Mock Plot')).toBeInTheDocument();
  });
});
