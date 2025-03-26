import { render, screen, waitFor } from '@testing-library/react';
import Menu from './Menu';


test('renders menu while hovering', async () => {
  render(<Menu hovering={true} >Child</Menu>);

  await waitFor(() => {
    expect(screen.getByText('Child')).toBeInTheDocument();
  });
});

test('does not renders menu if not hovering', async () => {
  render(<Menu hovering={false} >Child</Menu>);

  await waitFor(() => {
    expect(screen.queryByText('Child')).not.toBeVisible();
  });
});
