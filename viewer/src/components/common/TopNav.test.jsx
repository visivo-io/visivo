import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { futureFlags } from '../../router-config';
import TopNav from './TopNav';

const renderNav = (props = {}) =>
  render(
    <MemoryRouter initialEntries={['/workspace']} future={futureFlags}>
      <TopNav {...props} />
    </MemoryRouter>
  );

describe('TopNav', () => {
  it('renders the three intra-project tools (Workspace subsumes Editor + Lineage)', () => {
    renderNav();
    ['Explorer', 'Workspace', 'Dashboards'].forEach(label => {
      expect(screen.getByTitle(label)).toBeInTheDocument();
    });
    // The legacy Editor / Lineage tools are gone — folded into Workspace.
    expect(screen.queryByTitle('Editor')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Lineage')).not.toBeInTheDocument();
  });

  it('defaults to the single Local stage (the viewer has no real stages)', () => {
    renderNav();
    expect(screen.getByText('Local')).toBeInTheDocument();
  });

  it('shows both Commit and Deploy when there are uncommitted changes', () => {
    renderNav({ hasUncommittedChanges: true });
    expect(screen.getByTitle('Commit changes')).toBeInTheDocument();
    expect(screen.getByTitle('Deploy')).toBeInTheDocument();
  });

  it('shows neither Commit nor Deploy when the project is clean', () => {
    renderNav({ hasUncommittedChanges: false });
    expect(screen.queryByTitle('Deploy')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Commit changes')).not.toBeInTheDocument();
  });

  it('shows Commit but not Deploy when dirty and showDeploy is false (cloud)', () => {
    renderNav({ hasUncommittedChanges: true, showDeploy: false });
    expect(screen.getByTitle('Commit changes')).toBeInTheDocument();
    expect(screen.queryByTitle('Deploy')).not.toBeInTheDocument();
  });

  it('badges the Commit button with the pending-change count', () => {
    renderNav({ hasUncommittedChanges: true, commitCount: 3 });
    expect(screen.getByTitle('Commit changes')).toHaveTextContent(/Commit\s*3/);
  });

  it('omits the count badge when there are zero pending changes', () => {
    // (defensive — Commit only renders when dirty, but a 0 count must not badge)
    renderNav({ hasUncommittedChanges: true, commitCount: 0 });
    expect(screen.getByTitle('Commit changes')).toHaveTextContent('Commit');
    expect(screen.getByTitle('Commit changes')).not.toHaveTextContent('0');
  });

  it('hides version history when no versions are provided (local)', () => {
    renderNav();
    expect(screen.queryByText(/PROJECT HISTORY/i)).not.toBeInTheDocument();
  });

  it('version pill is a plain label for a single deploy, a dropdown for many', () => {
    const proj = { currentProject: { id: 'p', name: 'p' } };
    // single version → clicking it opens nothing
    const { unmount } = renderNav({
      ...proj,
      versions: [{ id: 'v1', ts: '6/5/2026, 8:00 AM', live: true }],
      currentVersion: { id: 'v1', ts: '6/5/2026, 8:00 AM', live: true },
    });
    fireEvent.click(screen.getByText('6/5/2026, 8:00 AM'));
    expect(screen.queryByText(/PROJECT HISTORY/i)).not.toBeInTheDocument();
    unmount();

    // multiple versions → clicking opens the history dropdown
    renderNav({
      ...proj,
      versions: [
        { id: 'v1', ts: 'today', live: true },
        { id: 'v2', ts: 'earlier', live: false },
      ],
      currentVersion: { id: 'v1', ts: 'today', live: true },
    });
    fireEvent.click(screen.getByText('today'));
    expect(screen.getByText(/PROJECT HISTORY/i)).toBeInTheDocument();
  });

  it('account variant (no tools, no stages) shows neither tools nor a capsule', () => {
    renderNav({ tools: [], stages: [] });
    expect(screen.queryByTitle('Explorer')).not.toBeInTheDocument();
    expect(screen.queryByText('Local')).not.toBeInTheDocument();
  });

  it('stage variant (a stage, no tools) shows the stage pill but no tools', () => {
    const stages = [{ id: 'prod', name: 'Production', color: '#16a34a', isDefault: true }];
    renderNav({ tools: [], stages, currentStage: stages[0], onAllStages: () => {} });
    expect(screen.getByText('Production')).toBeInTheDocument();
    expect(screen.queryByTitle('Explorer')).not.toBeInTheDocument();
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

  describe('user menu (cloud)', () => {
    // The avatar trigger shows the user's initial; click it to open the menu.
    const openMenu = props => {
      renderNav({ tools: [], stages: [], user: { name: 'Zoe', email: 'zoe@x.io' }, ...props });
      fireEvent.click(screen.getByText('Z'));
    };

    it('renders userMenuItems and invokes their onClick', () => {
      const onProfile = jest.fn();
      openMenu({
        userMenuItems: [
          { label: 'Profile', onClick: onProfile },
          { label: 'Account', onClick: () => {} },
        ],
      });
      expect(screen.getByText('Profile')).toBeInTheDocument();
      expect(screen.getByText('Account')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Profile'));
      expect(onProfile).toHaveBeenCalledTimes(1);
    });

    it('always offers Sign out and calls onSignOut', () => {
      const onSignOut = jest.fn();
      openMenu({ onSignOut, userMenuItems: [] });
      fireEvent.click(screen.getByText('Sign out'));
      expect(onSignOut).toHaveBeenCalledTimes(1);
    });

    it('shows no menu items beyond Sign out when none are provided', () => {
      // The old dead "Account"/"Organization" placeholders are gone.
      openMenu({});
      expect(screen.getByText('Sign out')).toBeInTheDocument();
      expect(screen.queryByText('Organization')).not.toBeInTheDocument();
      expect(screen.queryByText('Account')).not.toBeInTheDocument();
    });
  });
});
