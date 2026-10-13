import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import ThemeEditForm from './ThemeEditForm';
import useStore from '../../../stores/store';
import { BUILTIN_THEMES } from '../../../theme/builtinThemes';

let lastPlotLayout = null;
jest.mock('react-plotly.js', () => ({
  __esModule: true,
  default: props => {
    lastPlotLayout = props.layout;
    return <div data-testid="preview-plot" />;
  },
}));

const seed = ({ theme = null, saveTheme = jest.fn(() => Promise.resolve({ success: true })) } = {}) => {
  act(() => {
    useStore.setState({ theme, project: { id: 'p1' }, fetchTheme: jest.fn(), saveTheme });
  });
  return saveTheme;
};

describe('ThemeEditForm', () => {
  beforeEach(() => {
    lastPlotLayout = null;
  });

  it('loads the saved theme and previews it in the default mode', () => {
    seed({ theme: { mode: 'dark', dark: { surface: '#101010' } } });
    render(<ThemeEditForm />);

    expect(screen.getByLabelText('Default mode')).toHaveValue('dark');
    expect(screen.getByTestId('theme-preview')).toHaveAttribute('data-theme', 'dark');
    expect(lastPlotLayout.template.layout.paper_bgcolor).toBe('#101010');
  });

  it('shows built-in values as placeholders and edits only the selected scope', async () => {
    const saveTheme = seed();
    render(<ThemeEditForm />);

    expect(screen.getByLabelText('Accent')).toHaveAttribute(
      'placeholder',
      BUILTIN_THEMES.light.accent
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Dark only' }));
    expect(screen.getByTestId('theme-preview')).toHaveAttribute('data-theme', 'dark');
    fireEvent.change(screen.getByLabelText('Accent'), { target: { value: '#00ff00' } });
    fireEvent.change(screen.getByLabelText(/Plotly layout/), {
      target: { value: '{"font": {"size": 15}}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));

    await waitFor(() => expect(saveTheme).toHaveBeenCalled());
    expect(saveTheme.mock.calls[0][0]).toEqual({
      dark: { accent: '#00ff00', plotly_layout: { font: { size: 15 } } },
    });
    expect(await screen.findByText('Saved as a draft')).toBeInTheDocument();
  });

  it('picks a predefined palette or a custom list for series colors', async () => {
    const saveTheme = seed();
    render(<ThemeEditForm />);

    fireEvent.change(screen.getByLabelText('Series colors'), { target: { value: '__custom__' } });
    fireEvent.change(screen.getByLabelText('Custom series colors'), {
      target: { value: '#111111, #222222' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));

    await waitFor(() => expect(saveTheme).toHaveBeenCalled());
    expect(saveTheme.mock.calls[0][0].colorway).toEqual(['#111111', '#222222']);
  });

  it('refuses to save invalid layout JSON', () => {
    const saveTheme = seed();
    render(<ThemeEditForm />);

    fireEvent.change(screen.getByLabelText(/Plotly layout/), { target: { value: '{nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));

    expect(screen.getByText(/not valid JSON/)).toBeInTheDocument();
    expect(saveTheme).not.toHaveBeenCalled();
  });

  it('surfaces server validation errors', async () => {
    seed({ saveTheme: jest.fn(() => Promise.resolve({ success: false, error: 'Invalid theme: surface' })) });
    render(<ThemeEditForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));

    expect(await screen.findByText('Invalid theme: surface')).toBeInTheDocument();
  });

  it('resets to the built-in theme', async () => {
    const saveTheme = seed({ theme: { mode: 'dark', accent: '#123456' } });
    render(<ThemeEditForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset to built-in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));

    await waitFor(() => expect(saveTheme).toHaveBeenCalledWith({}));
  });
});
