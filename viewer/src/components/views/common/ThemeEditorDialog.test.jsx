import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ThemeEditorDialog from './ThemeEditorDialog';

jest.mock('./ThemeEditForm', () => ({
  __esModule: true,
  default: () => <div data-testid="theme-form-stub" />,
}));

describe('ThemeEditorDialog', () => {
  it('renders nothing while closed', () => {
    render(<ThemeEditorDialog open={false} onClose={jest.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the theme form and closes from the button, Escape or the backdrop', () => {
    const onClose = jest.fn();
    const outerClick = jest.fn();
    render(
      <div onClick={outerClick}>
        <ThemeEditorDialog open onClose={onClose} />
      </div>
    );

    expect(screen.getByRole('dialog', { name: 'Dashboard theme' })).toBeInTheDocument();
    expect(screen.getByTestId('theme-form-stub')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('theme-form-stub'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('theme-editor-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(outerClick).not.toHaveBeenCalled();
  });
});
