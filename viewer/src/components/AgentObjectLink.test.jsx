import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AgentObjectLink from './AgentObjectLink';
import { setViewerBase } from '../contexts/viewerBase';
import { futureFlags } from '../router-config';

const renderLink = () =>
  render(
    <MemoryRouter future={futureFlags}>
      <AgentObjectLink object={{ type: 'model', name: 'orders' }} />
    </MemoryRouter>
  );

afterEach(() => setViewerBase(''));

describe('AgentObjectLink', () => {
  it('links to the object at the root mount', () => {
    renderLink();
    expect(screen.getByTestId('agent-action-object-orders')).toHaveAttribute(
      'href',
      '/workspace?edit=model%3Aorders'
    );
  });

  it('stays inside the project when the viewer is mounted under a prefix', () => {
    setViewerBase('/acme/main/p-1');
    renderLink();
    expect(screen.getByTestId('agent-action-object-orders')).toHaveAttribute(
      'href',
      '/acme/main/p-1/workspace?edit=model%3Aorders'
    );
  });
});
