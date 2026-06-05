import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { futureFlags } from '../../router-config';
import TopNav from './TopNav';

const renderNav = (props = {}) =>
  render(
    <MemoryRouter initialEntries={['/editor']} future={futureFlags}>
      <TopNav {...props} />
    </MemoryRouter>
  );

describe('TopNav', () => {
  it('renders the four intra-project tools', () => {
    renderNav();
    ['Explorer', 'Lineage', 'Editor', 'Dashboards'].forEach(label => {
      expect(screen.getByTitle(label)).toBeInTheDocument();
    });
  });

  it('defaults to the single Local stage (the viewer has no real stages)', () => {
    renderNav();
    expect(screen.getByText('Local')).toBeInTheDocument();
  });

  it('shows Commit and hides Deploy when there are uncommitted changes', () => {
    renderNav({ hasUncommittedChanges: true });
    expect(screen.getByTitle('Commit changes')).toBeInTheDocument();
    expect(screen.queryByTitle('Deploy')).not.toBeInTheDocument();
  });

  it('shows Deploy and hides Commit when clean', () => {
    renderNav({ hasUncommittedChanges: false });
    expect(screen.getByTitle('Deploy')).toBeInTheDocument();
    expect(screen.queryByTitle('Commit changes')).not.toBeInTheDocument();
  });

  it('hides Deploy entirely when showDeploy is false (cloud has no deploy)', () => {
    renderNav({ hasUncommittedChanges: false, showDeploy: false });
    expect(screen.queryByTitle('Deploy')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Commit changes')).not.toBeInTheDocument();
  });

  it('hides version history when no versions are provided (local)', () => {
    renderNav();
    expect(screen.queryByText(/PROJECT HISTORY/i)).not.toBeInTheDocument();
  });

  it('stage dropdown always shows the search and lists DEFAULT before STARRED', () => {
    const stages = [
      { id: 'prod', name: 'Production', color: '#16a34a', desc: 'live', starred: true },
      { id: 'local', name: 'Local', color: '#6b7280', desc: 'serve', isDefault: true, flag: 'Default' },
    ];
    renderNav({
      stages,
      currentStage: stages[1],
      projects: [{ id: 'p', name: 'p' }],
      currentProject: { id: 'p', name: 'p' },
    });

    // Open the stage segment (shows the current stage "Local").
    fireEvent.click(screen.getByText('Local'));

    expect(screen.getByPlaceholderText('Find a stage…')).toBeInTheDocument();
    const def = screen.getByText('DEFAULT');
    const starred = screen.getByText('STARRED');
    // DEFAULT must come before STARRED in the DOM.
    // eslint-disable-next-line no-bitwise
    expect(def.compareDocumentPosition(starred) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
