import { act, render, screen, fireEvent } from '@testing-library/react';
import SnackBar from './SnackBar';

test('Render SnackBar when open is true', () => {
  render(<SnackBar message="Text message" open={true} setOpen={jest.fn()} />)
  expect(screen.getByText("Text message")).toBeInTheDocument()
})

test('Set Open to false when close SnackBar button is clicked', () => {
  const setOpenMock = jest.fn();
  render(<SnackBar message="Test Message" open={true} setOpen={setOpenMock} />);

  const closeButton = screen.getByRole('button', { name: /close/i });
  fireEvent.click(closeButton);

  expect(setOpenMock).toHaveBeenCalledWith(false);
})

test('Set Open to false when SnackBar autoHideDuration is triggered', () => {
  jest.useFakeTimers();
  const setOpenMock = jest.fn();
  render(<SnackBar message="Test Message" open={true} setOpen={setOpenMock} />);

  act(() => {
    jest.advanceTimersByTime(6000);
  });
  expect(setOpenMock).toHaveBeenCalledWith(false);

  jest.useRealTimers();
})
