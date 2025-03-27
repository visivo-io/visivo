import { render, screen, waitFor } from '@testing-library/react';
import NameSelector from './NameSelector';
import { withProviders } from '../../utils/test-utils';

let selector;

beforeEach(() => {
  selector = {
    name: "selector",
    type: "single",
    parent_name: "selector",
    options: [
      { name: "row", type: "row" }
    ]
  }
});

test('renders selector', async () => {
  render(<NameSelector names={["row"]} selector={selector} project={{ id: 1 }} itemWidth={1} />, { wrapper: withProviders });

  await waitFor(() => {
    expect(screen.getByText('row')).toBeInTheDocument();
  });
});
