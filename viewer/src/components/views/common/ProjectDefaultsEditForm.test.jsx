/**
 * ProjectDefaultsEditForm level-seeding tests (VIS-899).
 *
 * Guards the fix that makes the right-rail Project-Settings form read the SAME
 * effective levels the canvas Project Editor shows: when no levels are
 * configured the form must seed from the shared defaults (NOT show
 * "No dashboard levels defined"), and when levels are configured it shows them.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import ProjectDefaultsEditForm from './ProjectDefaultsEditForm';
import { defaultLevels } from '../../../utils/dashboardUtils';
import useStore from '../../../stores/store';

const seedStore = () => {
  act(() => {
    useStore.setState({
      fetchSources: jest.fn(),
      saveDefaults: jest.fn().mockResolvedValue({ success: true }),
      checkCommitStatus: jest.fn(),
      sources: [],
    });
  });
};

const renderForm = defaults =>
  render(<ProjectDefaultsEditForm defaults={defaults} onSave={() => {}} onClose={() => {}} />);

const titleValues = () =>
  screen.queryAllByPlaceholderText('Title').map(input => input.value);

describe('ProjectDefaultsEditForm levels', () => {
  beforeEach(seedStore);

  test('seeds the shared default levels when none configured (no empty-state)', () => {
    renderForm({ levels: [] });
    expect(screen.queryByText('No dashboard levels defined.')).not.toBeInTheDocument();
    expect(titleValues()).toEqual(defaultLevels.map(l => l.title));
  });

  test('shows configured levels in order when present', () => {
    renderForm({ levels: [{ title: 'Exec', description: 'top' }, { title: 'Ops', description: 'x' }] });
    expect(titleValues()).toEqual(['Exec', 'Ops']);
  });

  test('handles null defaults by falling back to shared defaults', () => {
    renderForm(null);
    expect(titleValues()).toEqual(defaultLevels.map(l => l.title));
  });
});
