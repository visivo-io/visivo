import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { futureFlags } from '../../router-config';
import { useMediaQuery } from '@mui/material';
import TopNav from './TopNav';

// TopNav derives its narrow (mobile) variant from MUI's useMediaQuery; mock it
// so tests can drive both the desktop and narrow layouts deterministically.
jest.mock('@mui/material', () => {
  const actual = jest.requireActual('@mui/material');
  return { ...actual, useMediaQuery: jest.fn(() => false) };
});

const renderNav = (props = {}) =>
  render(
    <MemoryRouter initialEntries={['/workspace']} future={futureFlags}>
      <TopNav {...props} />
    </MemoryRouter>
  );

describe('TopNav', () => {
  beforeEach(() => {
    useMediaQuery.mockImplementation(() => false);
  });

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

  it('shows Commit but not Deploy when there are uncommitted changes', () => {
    renderNav({ hasUncommittedChanges: true });
    expect(screen.getByTitle('Commit changes')).toBeInTheDocument();
    expect(screen.queryByTitle('Deploy')).not.toBeInTheDocument();
  });

  it('shows Deploy but not Commit when the project is clean', () => {
    renderNav({ hasUncommittedChanges: false });
    expect(screen.getByTitle('Deploy')).toBeInTheDocument();
    expect(screen.queryByTitle('Commit changes')).not.toBeInTheDocument();
  });

  it('shows neither when clean and showDeploy is false (cloud)', () => {
    renderNav({ hasUncommittedChanges: false, showDeploy: false });
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

    it('gives menu rows hover feedback (background tint on mouse enter/leave)', () => {
      openMenu({ userMenuItems: [{ label: 'Profile', onClick: () => {} }] });
      const row = screen.getByText('Profile');
      fireEvent.mouseEnter(row);
      expect(row.style.background).toBe('rgb(243, 244, 246)');
      fireEvent.mouseLeave(row);
      expect(row.style.background).toBe('transparent');
    });
  });

  describe('user menu (local, signed out)', () => {
    it('offers login, docs, community, and issue links when no user is present', () => {
      renderNav();
      fireEvent.click(screen.getByText('U')); // default avatar initial
      expect(screen.getByText('Log in / Sign up')).toHaveAttribute(
        'href',
        'https://app.visivo.io/register'
      );
      expect(screen.getByText('Documentation')).toBeInTheDocument();
      expect(screen.getByText('Join the Community')).toBeInTheDocument();
      expect(screen.getByText('Log an Issue')).toBeInTheDocument();
    });

    it('closes the menu when a link is clicked', () => {
      renderNav();
      fireEvent.click(screen.getByText('U'));
      fireEvent.click(screen.getByText('Documentation'));
      expect(screen.queryByText('Documentation')).not.toBeInTheDocument();
    });
  });

  describe('stage menu interactions', () => {
    const stages = [
      { id: 'prod', name: 'Production', color: '#16a34a', desc: 'live', kind: 'Cloud', starred: true },
      { id: 'local', name: 'Local', color: '#6b7280', desc: 'serve', isDefault: true, flag: 'Default' },
    ];
    const openStageMenu = (props = {}) => {
      renderNav({
        stages,
        currentStage: stages[1],
        projects: [{ id: 'p', name: 'p' }],
        currentProject: { id: 'p', name: 'p' },
        ...props,
      });
      fireEvent.click(screen.getByText('Local'));
    };

    it('picks a stage: fires onStageChange and closes the menu', () => {
      const onStageChange = jest.fn();
      openStageMenu({ onStageChange });
      fireEvent.click(screen.getByText('Production'));
      expect(onStageChange).toHaveBeenCalledWith(stages[0]);
      expect(screen.queryByText('Switch stage')).not.toBeInTheDocument();
    });

    it('filters stages by search text (name, kind, and desc all match)', () => {
      openStageMenu();
      const input = screen.getByPlaceholderText('Find a stage…');
      fireEvent.change(input, { target: { value: 'cloud' } });
      // Sections collapse into results while searching.
      expect(screen.queryByText('DEFAULT')).not.toBeInTheDocument();
      expect(screen.getByText('Production')).toBeInTheDocument();
      expect(screen.queryByText('serve')).not.toBeInTheDocument();
    });

    it('shows a friendly empty state when no stage matches', () => {
      openStageMenu();
      fireEvent.change(screen.getByPlaceholderText('Find a stage…'), {
        target: { value: 'zzz-nope' },
      });
      expect(screen.getByText(/No stage matches/)).toBeInTheDocument();
    });

    it('clears the search via the inline ✕ affordance', () => {
      openStageMenu();
      const input = screen.getByPlaceholderText('Find a stage…');
      fireEvent.change(input, { target: { value: 'prod' } });
      // The clear icon is the second svg inside the search box (after the loupe).
      // eslint-disable-next-line testing-library/no-node-access
      const clearIcon = input.parentElement.querySelectorAll('svg')[1];
      fireEvent.click(clearIcon);
      expect(input).toHaveValue('');
      expect(screen.getByText('DEFAULT')).toBeInTheDocument();
    });

    it('offers "View all stages" when onAllStages is provided and invokes it', () => {
      const onAllStages = jest.fn();
      openStageMenu({ onAllStages });
      fireEvent.click(screen.getByText('View all stages'));
      expect(onAllStages).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Switch stage')).not.toBeInTheDocument();
    });

    it('counts the stages in the menu header', () => {
      openStageMenu();
      expect(screen.getByText('2 stages')).toBeInTheDocument();
    });
  });

  describe('project menu', () => {
    const projects = [
      { id: 'a', name: 'Alpha', objs: 5 },
      { id: 'b', name: 'Beta' },
    ];

    it('opens the project list and fires onProjectChange for a pick', () => {
      const onProjectChange = jest.fn();
      renderNav({ projects, currentProject: projects[0], onProjectChange });
      fireEvent.click(screen.getByText('Alpha'));
      expect(screen.getByText('PROJECTS')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument(); // objs count
      fireEvent.click(screen.getByText('Beta'));
      expect(onProjectChange).toHaveBeenCalledWith(projects[1]);
      expect(screen.queryByText('PROJECTS')).not.toBeInTheDocument();
    });

    it('renders a plain (non-dropdown) project segment for a single project', () => {
      renderNav({ projects: [projects[0]], currentProject: projects[0] });
      fireEvent.click(screen.getByText('Alpha'));
      expect(screen.queryByText('PROJECTS')).not.toBeInTheDocument();
    });
  });

  describe('version history (cloud)', () => {
    const versions = [
      { id: 'v1', ts: 'today', live: true },
      { id: 'v2', ts: 'yesterday', live: false, msg: 'fix charts', who: 'ana' },
    ];

    it('picking an older version fires onVersionChange with that version', () => {
      const onVersionChange = jest.fn();
      renderNav({
        currentProject: { id: 'p', name: 'p' },
        versions,
        currentVersion: versions[0],
        onVersionChange,
      });
      fireEvent.click(screen.getByText('today'));
      expect(screen.getByText('fix charts · ana')).toBeInTheDocument();
      fireEvent.click(screen.getByText('yesterday'));
      expect(onVersionChange).toHaveBeenCalledWith(versions[1]);
    });

    it('shows the read-only history banner and returns to live via its button', () => {
      const onVersionChange = jest.fn();
      renderNav({
        currentProject: { id: 'p', name: 'p' },
        versions,
        currentVersion: versions[1],
        onVersionChange,
      });
      expect(screen.getByText('Viewing history')).toBeInTheDocument();
      expect(screen.getByText(/deployed yesterday by ana/)).toBeInTheDocument();
      fireEvent.click(screen.getByText('Back to live'));
      expect(onVersionChange).toHaveBeenCalledWith(versions[0]);
    });
  });

  describe('commit / deploy buttons', () => {
    it('fires onCommitClick when dirty and onDeployClick when clean', () => {
      const onCommitClick = jest.fn();
      const onDeployClick = jest.fn();
      const { rerender } = renderNav({ hasUncommittedChanges: true, onCommitClick, onDeployClick });
      fireEvent.click(screen.getByTitle('Commit changes'));
      expect(onCommitClick).toHaveBeenCalledTimes(1);
      expect(screen.queryByTitle('Deploy')).not.toBeInTheDocument();

      rerender(
        <MemoryRouter initialEntries={['/workspace']} future={futureFlags}>
          <TopNav
            hasUncommittedChanges={false}
            onCommitClick={onCommitClick}
            onDeployClick={onDeployClick}
          />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByTitle('Deploy'));
      expect(onDeployClick).toHaveBeenCalledTimes(1);
      expect(screen.queryByTitle('Commit changes')).not.toBeInTheDocument();
    });

    it('darkens on hover and restores on leave', () => {
      const { unmount } = renderNav({ hasUncommittedChanges: true });
      const commit = screen.getByTitle('Commit changes');
      fireEvent.mouseEnter(commit);
      expect(commit.style.background).toBe('rgb(21, 128, 61)');
      fireEvent.mouseLeave(commit);
      expect(commit.style.background).toBe('rgb(22, 163, 74)');
      unmount();

      renderNav({ hasUncommittedChanges: false });
      const deploy = screen.getByTitle('Deploy');
      fireEvent.mouseEnter(deploy);
      expect(deploy.style.background).toBe('rgb(90, 47, 70)');
      fireEvent.mouseLeave(deploy);
      expect(deploy.style.background).toBe('rgb(113, 59, 87)');
    });
  });

  describe('narrow (mobile) layout', () => {
    beforeEach(() => {
      useMediaQuery.mockImplementation(() => true);
    });

    it('still renders the tools, capsule, and user menu', () => {
      renderNav();
      ['Explorer', 'Workspace', 'Dashboards'].forEach(label => {
        expect(screen.getByTitle(label)).toBeInTheDocument();
      });
      expect(screen.getByText('Local')).toBeInTheDocument();
    });

    it('compacts Commit and Deploy to icon-only buttons', () => {
      const { unmount } = renderNav({ hasUncommittedChanges: true, commitCount: 2 });
      const commit = screen.getByTitle('Commit changes');
      expect(commit).not.toHaveTextContent('Commit');
      expect(commit).toHaveTextContent('2'); // count badge survives compaction
      unmount();

      renderNav({ hasUncommittedChanges: false });
      expect(screen.getByTitle('Deploy')).not.toHaveTextContent('Deploy');
    });

    it('compacts the version pill to the date part before the comma', () => {
      renderNav({
        currentProject: { id: 'p', name: 'p' },
        versions: [{ id: 'v1', ts: '6/5/2026, 8:00 AM', live: true }],
        currentVersion: { id: 'v1', ts: '6/5/2026, 8:00 AM', live: true },
      });
      expect(screen.getByText('6/5/2026')).toBeInTheDocument();
      expect(screen.queryByText('6/5/2026, 8:00 AM')).not.toBeInTheDocument();
    });
  });
});
