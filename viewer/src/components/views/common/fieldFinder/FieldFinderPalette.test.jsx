/**
 * FieldFinderPalette — the ⌘K palette UI (VIS-1021). Runs against a synthetic
 * index so search/rank/inline-edit/reveal behavior is exact.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FieldFinderPalette from './FieldFinderPalette';
import { readMru, clearMru, bumpMru } from './fieldFinderMru';

const ENTRIES = [
  { path: 'x', label: 'X Axis', description: 'x coordinates', keywords: ['x', 'axis'], tier: 'A', controlType: 'array', enumValues: null, isScalar: false, hidden: false },
  { path: 'opacity', label: 'Opacity', description: 'trace opacity', keywords: ['opacity', 'transparency'], tier: 'B', controlType: 'number', enumValues: null, isScalar: true, hidden: false },
  { path: 'mode', label: 'Display Mode', description: 'draw mode', keywords: ['mode'], tier: 'B', controlType: 'enum', enumValues: ['lines', 'markers'], isScalar: true, hidden: false },
  { path: 'line.dash', label: 'Line Dash', description: 'dash style of lines', keywords: ['dash', 'dashed'], tier: 'B', controlType: 'string', enumValues: null, isScalar: true, hidden: false },
  { path: 'visible', label: 'Visible', description: 'show trace', keywords: ['visible'], tier: 'B', controlType: 'boolean', enumValues: null, isScalar: true, hidden: false },
  { path: 'marker.color', label: 'Marker Color', description: 'marker fill', keywords: ['fill'], tier: 'B', controlType: 'color', enumValues: null, isScalar: true, hidden: false },
  { path: 'marker.colorbar', label: 'Colorbar', description: 'the color bar', keywords: ['colorbar'], tier: null, controlType: 'object', enumValues: null, isScalar: false, hidden: false },
];

const setup = (over = {}) => {
  const props = {
    type: 'scatter',
    entries: ENTRIES,
    value: {},
    onEditScalar: jest.fn(),
    onRevealCompound: jest.fn(),
    onClose: jest.fn(),
    ...over,
  };
  render(<FieldFinderPalette {...props} />);
  return props;
};

beforeEach(() => clearMru());

describe('FieldFinderPalette', () => {
  it('opens focused with the empty-query curated set (Tier A/B), hiding the un-curated tail', () => {
    setup();
    expect(screen.getByTestId('field-finder-input')).toHaveFocus();
    // Curated Tier A/B render; the tier-null container does not (until "show all").
    expect(screen.getByTestId('field-finder-row-x')).toBeInTheDocument();
    expect(screen.getByTestId('field-finder-row-opacity')).toBeInTheDocument();
    expect(screen.queryByTestId('field-finder-row-marker.colorbar')).not.toBeInTheDocument();
  });

  it('“Show all fields” reveals the full index including un-curated containers', () => {
    setup();
    fireEvent.click(screen.getByTestId('field-finder-show-all'));
    expect(screen.getByTestId('field-finder-row-marker.colorbar')).toBeInTheDocument();
  });

  it('searching narrows to matches and surfaces a synonym-boosted path first', () => {
    setup();
    fireEvent.change(screen.getByTestId('field-finder-input'), { target: { value: 'dashed' } });
    // "dashed" is a trace synonym + keyword for line.dash.
    const rows = screen.getAllByTestId(/^field-finder-row-/);
    expect(rows[0]).toHaveAttribute('data-testid', 'field-finder-row-line.dash');
  });

  it('shows the current value badge for a set prop', () => {
    setup({ value: { opacity: 0.5 } });
    expect(screen.getByTestId('field-finder-value-opacity')).toHaveTextContent('0.5');
  });

  it('inline-edits a scalar number and bumps the MRU (find-and-change in one motion)', () => {
    const { onEditScalar } = setup({ value: { opacity: 0.5 } });
    fireEvent.change(screen.getByTestId('field-finder-input'), { target: { value: 'opacity' } });
    const input = screen.getByLabelText('Opacity value');
    fireEvent.change(input, { target: { value: '0.8' } });
    fireEvent.blur(input);
    expect(onEditScalar).toHaveBeenCalledWith('opacity', 0.8);
    expect(readMru('scatter')).toContain('opacity');
  });

  it('inline-edits an enum via option chips', () => {
    const { onEditScalar } = setup();
    fireEvent.change(screen.getByTestId('field-finder-input'), { target: { value: 'mode' } });
    fireEvent.click(screen.getByRole('button', { name: 'markers' }));
    expect(onEditScalar).toHaveBeenCalledWith('mode', 'markers');
  });

  it('a compound result jumps-and-focuses (reveal + close) and bumps MRU', () => {
    const { onRevealCompound, onClose } = setup();
    fireEvent.change(screen.getByTestId('field-finder-input'), { target: { value: 'colorbar' } });
    fireEvent.click(screen.getByTestId('field-finder-row-marker.colorbar'));
    expect(onRevealCompound).toHaveBeenCalledWith('marker.colorbar');
    expect(onClose).toHaveBeenCalled();
    expect(readMru('scatter')).toContain('marker.colorbar');
  });

  it('a layout-scoped synonym returns ZERO field rows + a "belongs elsewhere" note', () => {
    setup();
    fireEvent.change(screen.getByTestId('field-finder-input'), { target: { value: 'stacked' } });
    expect(screen.getByTestId('field-finder-layout-note')).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^field-finder-row-/)).toHaveLength(0);
  });

  it('a scope:none synonym returns a single explanatory row', () => {
    setup();
    fireEvent.change(screen.getByTestId('field-finder-input'), { target: { value: 'trend line' } });
    expect(screen.getByTestId('field-finder-none-note')).toHaveTextContent(/not a built-in/i);
    expect(screen.queryAllByTestId(/^field-finder-row-/)).toHaveLength(0);
  });

  it('a typed query with no matches shows the empty state', () => {
    setup();
    fireEvent.change(screen.getByTestId('field-finder-input'), { target: { value: 'zzzznope' } });
    expect(screen.getByTestId('field-finder-empty')).toBeInTheDocument();
  });

  it('Escape closes the palette', () => {
    const { onClose } = setup();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape closes the palette even after focus has left the dialog element', () => {
    const { onClose } = setup();
    document.body.focus();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape in the inline editor keeps a typed valid value and closes', () => {
    const { onEditScalar, onClose } = setup({ value: { opacity: 0.5 } });
    fireEvent.change(screen.getByTestId('field-finder-input'), { target: { value: 'opacity' } });
    const input = screen.getByLabelText('Opacity value');
    fireEvent.change(input, { target: { value: '0.8' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onEditScalar).toHaveBeenCalledWith('opacity', 0.8);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape with an unusable draft closes without changing the applied value', () => {
    const { onEditScalar, onClose } = setup({ value: { opacity: 0.5 } });
    fireEvent.change(screen.getByTestId('field-finder-input'), { target: { value: 'opacity' } });
    const input = screen.getByLabelText('Opacity value');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onEditScalar).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape with an unchanged draft does not re-commit', () => {
    const { onEditScalar, onClose } = setup({ value: { opacity: 0.5 } });
    fireEvent.change(screen.getByTestId('field-finder-input'), { target: { value: 'opacity' } });
    fireEvent.keyDown(screen.getByLabelText('Opacity value'), { key: 'Escape' });
    expect(onEditScalar).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape in a string editor keeps the typed text', () => {
    const { onEditScalar } = setup();
    fireEvent.change(screen.getByTestId('field-finder-input'), { target: { value: 'dash' } });
    const input = screen.getByLabelText('Line Dash value');
    fireEvent.change(input, { target: { value: 'dot' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onEditScalar).toHaveBeenCalledWith('line.dash', 'dot');
  });

  it('Enter in the inline editor commits the typed value', () => {
    const { onEditScalar } = setup({ value: { opacity: 0.5 } });
    fireEvent.change(screen.getByTestId('field-finder-input'), { target: { value: 'opacity' } });
    const input = screen.getByLabelText('Opacity value');
    fireEvent.change(input, { target: { value: '0.2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onEditScalar).toHaveBeenCalledWith('opacity', 0.2);
  });

  it('removes the document Escape listener on unmount', () => {
    const onClose = jest.fn();
    const { unmount } = render(
      <FieldFinderPalette type="scatter" entries={ENTRIES} value={{}} onClose={onClose} />
    );
    unmount();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('boolean rows commit On/Off', () => {
    const { onEditScalar } = setup({ value: { visible: true } });
    fireEvent.change(screen.getByTestId('field-finder-input'), { target: { value: 'visible' } });
    fireEvent.click(screen.getByText('Off'));
    expect(onEditScalar).toHaveBeenCalledWith('visible', false);
  });

  it('color rows commit from the picker, Enter and Escape', () => {
    const { onEditScalar, onClose } = setup({ value: { 'marker.color': '#112233' } });
    fireEvent.change(screen.getByTestId('field-finder-input'), { target: { value: 'fill' } });
    fireEvent.change(screen.getByLabelText('Marker Color color'), { target: { value: '#ff0000' } });
    expect(onEditScalar).toHaveBeenLastCalledWith('marker.color', '#ff0000');
    const text = screen.getByLabelText('Marker Color value');
    fireEvent.change(text, { target: { value: '#00ff00' } });
    fireEvent.keyDown(text, { key: 'Enter' });
    expect(onEditScalar).toHaveBeenLastCalledWith('marker.color', '#00ff00');
    fireEvent.change(text, { target: { value: '#0000ff' } });
    fireEvent.keyDown(text, { key: 'Escape' });
    expect(onEditScalar).toHaveBeenLastCalledWith('marker.color', '#0000ff');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ArrowUp/ArrowDown move the active row and Enter focuses the scalar editor', () => {
    setup({ value: { opacity: 0.5 } });
    fireEvent.change(screen.getByTestId('field-finder-input'), { target: { value: 'opacity' } });
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    fireEvent.keyDown(dialog, { key: 'ArrowUp' });
    fireEvent.keyDown(dialog, { key: 'Enter' });
    expect(screen.getByLabelText('Opacity value')).toHaveFocus();
  });

  it('clicking the backdrop closes the palette', () => {
    const { onClose } = setup();
    fireEvent.mouseDown(screen.getByTestId('field-finder-overlay'));
    expect(onClose).toHaveBeenCalled();
  });

  it('ArrowDown moves the active row and Enter reveals a compound target', () => {
    const { onRevealCompound } = setup();
    // Show all so the compound container is in the list.
    fireEvent.click(screen.getByTestId('field-finder-show-all'));
    const dialog = screen.getByRole('dialog');
    // Walk down to the colorbar row and Enter.
    for (let i = 0; i < ENTRIES.length; i += 1) fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    fireEvent.keyDown(dialog, { key: 'Enter' });
    // The active row is a compound → reveal fired for some path (deterministic
    // order puts marker.colorbar last among the shown rows).
    expect(onRevealCompound).toHaveBeenCalled();
  });

  it('keeps the inline editor mounted and preserves the draft when Arrow keys fire inside it', () => {
    setup({ value: { opacity: 0.5 } });
    // Curated list has multiple rows; hover to make opacity the active (editing) row.
    fireEvent.mouseEnter(screen.getByTestId('field-finder-row-opacity'));
    const input = screen.getByLabelText('Opacity value');
    fireEvent.change(input, { target: { value: '3' } });
    // Arrow keys inside the editor must NOT bubble to the list handler (which
    // would move the active row and unmount the editor, dropping the draft).
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    const still = screen.getByLabelText('Opacity value');
    expect(still).toBeInTheDocument();
    expect(still.value).toBe('3');
  });

  it('hides the “recent first” hint when no visible curated row is MRU-floated', () => {
    // A tier-null path is recorded, but it never appears in the curated empty-query list.
    bumpMru('scatter', 'marker.colorbar');
    setup();
    expect(screen.queryByText('recent first')).not.toBeInTheDocument();
  });

  it('shows the “recent first” hint when a curated row IS MRU-floated', () => {
    bumpMru('scatter', 'opacity'); // Tier B → present in the curated list
    setup();
    expect(screen.getByText('recent first')).toBeInTheDocument();
  });
});
