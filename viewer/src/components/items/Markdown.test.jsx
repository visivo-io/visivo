import React from 'react';
import { render, screen, within } from '@testing-library/react';
import Markdown from './Markdown';

describe('Markdown Component', () => {
  const sampleMarkdown = {
    name: 'sample-markdown',
    path: 'sample-markdown',
    content: '# Hello World',
    justify: 'center',
    align: 'center',
  };

  const row = { height: 'regular' };
  const height = '400px';

  test('renders markdown content correctly', () => {
    render(<Markdown markdown={sampleMarkdown} row={row} height={height} />);
    const container = screen.getByTestId('sample-markdown');
    expect(within(container).getByText(/hello world/i)).toBeInTheDocument();
  });

  test('renders no built-in Copy/share button (the kebab owns Copy)', () => {
    render(<Markdown markdown={sampleMarkdown} row={row} height={height} />);
    // The per-item Copy link lives ONLY in the flip-layer kebab now — Markdown
    // itself renders no share button.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
