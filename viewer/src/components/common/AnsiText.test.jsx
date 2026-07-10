import { render, screen } from '@testing-library/react';
import AnsiText, { parseAnsi } from './AnsiText';

const ESC = '\x1b';

describe('parseAnsi', () => {
  it('returns a single plain segment when there are no escapes', () => {
    const segs = parseAnsi('plain log line');
    expect(segs).toHaveLength(1);
    expect(segs[0].text).toBe('plain log line');
    expect(segs[0].style).toEqual({ fg: null, bold: false, dim: false, underline: false });
  });

  it('underlines object names and greens the SUCCESS status', () => {
    const line = `Updated data for model ${ESC}[4mhistogram2dcontour-data-bins${ESC}[0m ...... [${ESC}[32mSUCCESS 0.04s${ESC}[0m]`;
    const segs = parseAnsi(line);

    const name = segs.find(s => s.text === 'histogram2dcontour-data-bins');
    expect(name.style.underline).toBe(true);

    const success = segs.find(s => s.text === 'SUCCESS 0.04s');
    expect(success.style.fg).toBe('#4ade80');

    // The bracket after the status is back to the reset (plain) state.
    const tail = segs.find(s => s.text === ']');
    expect(tail.style).toEqual({ fg: null, bold: false, dim: false, underline: false });
  });

  it('dims the database-file line and reds a FAILURE status', () => {
    const dimSeg = parseAnsi(`${ESC}[2mdatabase file: target/main/x.duckdb${ESC}[0m`).find(s =>
      s.text.includes('database file')
    );
    expect(dimSeg.style.dim).toBe(true);

    const fail = parseAnsi(`[${ESC}[31mFAILURE 0.10s${ESC}[0m]`).find(s => s.text === 'FAILURE 0.10s');
    expect(fail.style.fg).toBe('#f87171');
  });

  it('does not mistake a bare [2m-style substring in text for an escape', () => {
    const segs = parseAnsi('canvas is [2m x 2m] in size');
    expect(segs).toHaveLength(1);
    expect(segs[0].text).toBe('canvas is [2m x 2m] in size');
  });

  it('clears styling after a reset (code 0)', () => {
    const plain = parseAnsi(`${ESC}[32mgreen${ESC}[0mplain`).find(s => s.text === 'plain');
    expect(plain.style.fg).toBeNull();
  });
});

describe('AnsiText', () => {
  it('renders readable text and drops the raw escape codes', () => {
    const line = `Updated data for insight ${ESC}[4m2d-contour${ESC}[0m ...... [${ESC}[32mSUCCESS 0.02s${ESC}[0m]`;
    render(<AnsiText text={line} />);

    expect(screen.getByText('2d-contour')).toBeInTheDocument();
    expect(screen.getByText('SUCCESS 0.02s')).toBeInTheDocument();
    // The raw `[4m` / `[32m` control sequences are not shown as text.
    expect(screen.queryByText(/\[4m/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\[32m/)).not.toBeInTheDocument();
  });

  it('colors the SUCCESS run and underlines the object name', () => {
    const line = `insight ${ESC}[4mmy-insight${ESC}[0m [${ESC}[32mSUCCESS${ESC}[0m]`;
    render(<AnsiText text={line} />);
    expect(screen.getByText('my-insight')).toHaveStyle('text-decoration: underline');
    expect(screen.getByText('SUCCESS')).toHaveStyle('color: #4ade80');
  });

  it('renders empty text without crashing', () => {
    const { container } = render(<AnsiText text="" />);
    expect(container.textContent).toBe('');
  });
});
