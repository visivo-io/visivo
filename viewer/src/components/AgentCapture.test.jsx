import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AgentCapture from './AgentCapture';

describe('AgentCapture', () => {
  it('shows the capture', () => {
    render(<AgentCapture src="/api/agent/captures/revenue-abc.png" dashboard="revenue" />);

    expect(screen.getByRole('img', { name: 'Screenshot of revenue' })).toBeInTheDocument();
  });

  it('renders nothing without a source', () => {
    const { container } = render(<AgentCapture />);

    expect(container).toBeEmptyDOMElement();
  });

  it('opens at full size, because a thumbnail cannot carry the detail', async () => {
    render(<AgentCapture src="/api/agent/captures/revenue-abc.png" dashboard="revenue" />);

    await userEvent.click(screen.getByTestId('agent-capture'));

    expect(screen.getByTestId('agent-capture-full')).toBeInTheDocument();
  });

  it('closes again', async () => {
    render(<AgentCapture src="/api/agent/captures/revenue-abc.png" dashboard="revenue" />);
    await userEvent.click(screen.getByTestId('agent-capture'));

    await userEvent.click(screen.getByTestId('agent-capture-full'));

    expect(screen.queryByTestId('agent-capture-full')).not.toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the thumbnail', async () => {
    render(<AgentCapture src="/api/agent/captures/revenue-abc.png" dashboard="revenue" />);
    await userEvent.click(screen.getByTestId('agent-capture'));
    screen.getByTestId('agent-capture').blur();
    expect(screen.getByTestId('agent-capture')).not.toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByTestId('agent-capture-full')).not.toBeInTheDocument();
    expect(screen.getByTestId('agent-capture')).toHaveFocus();
  });

  it('disappears when the file is gone rather than showing a broken image', () => {
    // A `visivo run` can clear the output dir. A dead <img> in the transcript
    // reads as a bug in the agent rather than a file that is no longer there.
    render(<AgentCapture src="/api/agent/captures/gone.png" dashboard="revenue" />);

    fireEvent.error(screen.getByRole('img', { name: 'Screenshot of revenue' }));

    expect(screen.queryByTestId('agent-capture')).not.toBeInTheDocument();
  });
});
