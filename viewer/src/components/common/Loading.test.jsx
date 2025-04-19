import { render, screen, waitFor } from '@testing-library/react';
import Loading from './Loading';

test('renders loading text', async () => {
  render(<Loading text={"HELLO"} />)

  await waitFor(() => {
    expect(screen.getByText('HELLO')).toBeInTheDocument();
  });
})
