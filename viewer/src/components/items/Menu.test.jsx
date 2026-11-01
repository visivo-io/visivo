import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Menu from './Menu';
import useEscapeToClose from '../../hooks/useEscapeToClose';

const OuterLayer = ({ onClose, children }) => {
  useEscapeToClose(true, onClose);
  return <div>{children}</div>;
};

test('renders menu while hovering', async () => {
  render(<Menu hovering={true}>Child</Menu>);

  await waitFor(() => {
    expect(screen.getByText('Child')).toBeInTheDocument();
  });
});

test('does not renders menu if not hovering', async () => {
  render(<Menu hovering={false}>Child</Menu>);

  await waitFor(() => {
    expect(screen.queryByText('Child')).not.toBeVisible();
  });
});

test('the trigger toggles the menu open and closed', () => {
  render(<Menu hovering={true}>Child</Menu>);
  const trigger = screen.getByRole('button');

  fireEvent.click(trigger);
  expect(screen.getByText('Child')).toBeVisible();

  fireEvent.click(trigger);
  expect(screen.getByText('Child')).not.toBeVisible();
});

test('the menu closes when the pointer leaves the item', () => {
  const { rerender } = render(<Menu hovering={true}>Child</Menu>);
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByText('Child')).toBeVisible();

  rerender(<Menu hovering={false}>Child</Menu>);
  rerender(<Menu hovering={true}>Child</Menu>);

  expect(screen.getByText('Child')).not.toBeVisible();
});

test('Escape closes the open menu and returns focus to the trigger', () => {
  render(<Menu hovering={true}>Child</Menu>);
  const trigger = screen.getByRole('button');
  fireEvent.click(trigger);
  expect(screen.getByText('Child')).toBeVisible();

  fireEvent.keyDown(document, { key: 'Escape' });

  expect(screen.getByText('Child')).not.toBeVisible();
  expect(trigger).toHaveFocus();
});

test('Escape inside an open layer closes only the menu, then the layer', () => {
  const onOuterClose = jest.fn();
  render(
    <OuterLayer onClose={onOuterClose}>
      <Menu hovering={true}>Child</Menu>
    </OuterLayer>
  );
  fireEvent.click(screen.getByRole('button'));

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.getByText('Child')).not.toBeVisible();
  expect(onOuterClose).not.toHaveBeenCalled();

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onOuterClose).toHaveBeenCalledTimes(1);
});

test('without a dropdown the button keeps its own props and Escape is not claimed', () => {
  const onClick = jest.fn();
  const onOuterClose = jest.fn();
  render(
    <OuterLayer onClose={onOuterClose}>
      <Menu hovering={true} withDropDown={false} buttonProps={{ onClick }} buttonChildren="Go" />
    </OuterLayer>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Go' }));
  expect(onClick).toHaveBeenCalledTimes(1);

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onOuterClose).toHaveBeenCalledTimes(1);
});
