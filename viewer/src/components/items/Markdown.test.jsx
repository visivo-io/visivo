import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import Markdown from './Markdown';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';

jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: ({ icon, ...props }) => (
    <div role="button" data-testid="font-awesome-icon" {...props}></div>
  ),
}));

// Mock useCopyToClipboard hook
jest.mock('../../hooks/useCopyToClipboard', () => ({
  useCopyToClipboard: jest.fn(),
}));

describe('Markdown Component', () => {
  const mockCopyText = jest.fn();
  const mockResetToolTip = jest.fn();

  beforeEach(() => {
    useCopyToClipboard.mockReturnValue({
      toolTip: 'Copy',
      copyText: mockCopyText,
      resetToolTip: mockResetToolTip,
    });
  });

  const sampleMarkdown = {
    path: 'sample-markdown',
    markdown: '# Hello World',
    justify: 'center',
    align: 'center',
  };

  const row = { height: 'regular' };
  const height = '400px';

  test('renders markdown content correctly', () => {
    render(<Markdown markdown={sampleMarkdown} row={row} height={height} />);
    const container = document.getElementById('sample-markdown');
    expect(within(container).getByText(/hello world/i)).toBeInTheDocument();
  });


  test('shows share icon on hover and calls copyText on click', () => {
    render(<Markdown markdown={sampleMarkdown} row={row} height={height} />);

    const container = document.getElementById('sample-markdown');
    expect(container).toBeInTheDocument();

    // Simulate hover
    fireEvent.mouseOver(container);

    // Finding the icon
    const shareIcon = screen.getByTestId('font-awesome-icon');
    expect(shareIcon).toBeInTheDocument();

    // Simulate click
    fireEvent.click(shareIcon);

    // Check that copyText was called
    expect(mockCopyText).toHaveBeenCalledTimes(1);
    expect(mockCopyText).toHaveBeenCalledWith(expect.stringContaining('element_id=sample-markdown'));
  });


  test('calls resetToolTip on mouse leave of share icon', () => {
    render(<Markdown markdown={sampleMarkdown} row={row} height={height} />);

    // Find container by ID
    const container = document.getElementById('sample-markdown');
    expect(container).toBeInTheDocument();

    // Simulate hover
    fireEvent.mouseOver(container);

    // Find the icon
    const shareIcon = screen.getByTestId('font-awesome-icon');
    expect(shareIcon).toBeInTheDocument();

    // Simulate mouse leave
    fireEvent.mouseLeave(shareIcon);

    expect(mockResetToolTip).toHaveBeenCalledTimes(1);
  });

});
