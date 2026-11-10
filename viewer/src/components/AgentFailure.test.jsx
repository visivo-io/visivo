import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AgentFailure from './AgentFailure';

describe('AgentFailure', () => {
  it('shows plain copy instead of the raw error', () => {
    render(<AgentFailure error="TurnFailed 503" />);
    const box = screen.getByTestId('agent-failure');
    expect(box).toHaveTextContent('The AI model is busy right now.');
    expect(box).not.toHaveTextContent('TurnFailed');
    expect(box).toHaveAttribute('data-failure-code', 'provider_busy');
    expect(box).toHaveAttribute('role', 'alert');
  });

  it('shows and hides the raw error behind Show details', async () => {
    render(<AgentFailure error="TurnFailed 503" />);
    const toggle = screen.getByRole('button', { name: 'Show details' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(toggle);
    const details = screen.getByTestId('agent-failure-details');
    expect(details).toHaveTextContent('TurnFailed 503');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', details.id);
    expect(toggle).toHaveTextContent('Hide details');

    await userEvent.click(toggle);
    expect(screen.queryByTestId('agent-failure-details')).not.toBeInTheDocument();
  });

  it('has no details control when there is nothing to show', () => {
    render(<AgentFailure error={null} />);
    expect(screen.getByTestId('agent-failure')).toHaveTextContent(
      'The agent stopped because of an error.'
    );
    expect(screen.queryByTestId('agent-failure-toggle')).not.toBeInTheDocument();
  });

  it('uses the context and test id it is given', () => {
    render(<AgentFailure error="boom" context="stop" testId="x" className="mt-3" />);
    const box = screen.getByTestId('x');
    expect(box).toHaveTextContent('The agent could not be stopped.');
    expect(box).toHaveClass('mt-3');
    expect(screen.getByTestId('x-toggle')).toBeInTheDocument();
  });
});
