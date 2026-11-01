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

  it('shows the theme form and closes from the button or the backdrop', () => {
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
    fireEvent.click(screen.getByTestId('theme-editor-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(outerClick).not.toHaveBeenCalled();
  });

  it('closes on Escape while open', () => {
    const onClose = jest.fn();
    render(<ThemeEditorDialog open onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape while closed', () => {
    const onClose = jest.fn();
    render(<ThemeEditorDialog open={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves the dialog open when an inner element consumes Escape', () => {
    const onClose = jest.fn();
    render(<ThemeEditorDialog open onClose={onClose} />);
    const inner = screen.getByTestId('theme-form-stub');
    inner.addEventListener('keydown', e => e.preventDefault());
    fireEvent.keyDown(inner, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
