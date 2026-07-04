/**
 * ProjectDefaultsEditForm level-seeding tests (VIS-899).
 *
 * Guards the fix that makes the right-rail Project-Settings form read the SAME
 * effective levels the canvas Project Editor shows: when no levels are
 * configured the form must seed from the shared defaults (NOT show
 * "No dashboard levels defined"), and when levels are configured it shows them.
 */
import React from 'react';
import { render, screen, act, fireEvent, waitFor, within } from '@testing-library/react';
import selectEvent from 'react-select-event';
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

// --- Save path + field/level editing coverage -------------------------------

const getAction = name => useStore.getState()[name];
const clickSave = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));
const savedConfig = () => getAction('saveDefaults').mock.calls[0][0];

const renderWithClose = (defaults, onClose = jest.fn()) => {
  render(<ProjectDefaultsEditForm defaults={defaults} onSave={() => {}} onClose={onClose} />);
};

describe('ProjectDefaultsEditForm save path', () => {
  beforeEach(seedStore);

  test('saves the payload built from edited fields, refreshes commit status, and closes', async () => {
    const onClose = jest.fn();
    renderWithClose(
      {
        source_name: 's1',
        alert_name: 'slack',
        threads: 4,
        telemetry_enabled: true,
        levels: [{ title: 'Exec', description: 'top' }],
      },
      onClose
    );
    fireEvent.change(screen.getByLabelText(/Default Alert Name/), { target: { value: 'pager' } });
    fireEvent.change(screen.getByLabelText(/Threads/), { target: { value: '12' } });
    fireEvent.click(screen.getByLabelText(/Telemetry Enabled/));
    clickSave();
    await waitFor(() =>
      expect(getAction('saveDefaults')).toHaveBeenCalledWith({
        source_name: 's1',
        alert_name: 'pager',
        threads: 12,
        telemetry_enabled: false,
        levels: [{ title: 'Exec', description: 'top' }],
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(getAction('checkCommitStatus')).toHaveBeenCalled();
  });

  test('omits empty optional fields and keeps the shared defaults in the payload', async () => {
    renderWithClose({});
    clickSave();
    await waitFor(() => expect(getAction('saveDefaults')).toHaveBeenCalled());
    const config = savedConfig();
    expect(config).not.toHaveProperty('source_name');
    expect(config).not.toHaveProperty('alert_name');
    expect(config.threads).toBe(8);
    expect(config.telemetry_enabled).toBe(true);
    expect(config.levels).toEqual(defaultLevels);
  });

  test('selecting a default source through the RefSelector lands in the payload', async () => {
    act(() => {
      useStore.setState({ sources: [{ name: 's2', status: 'PUBLISHED' }] });
    });
    renderWithClose(null);
    await selectEvent.select(
      within(screen.getByTestId('ref-selector-source')).getByRole('combobox'),
      's2',
      { container: document.body }
    );
    clickSave();
    await waitFor(() => expect(getAction('saveDefaults')).toHaveBeenCalled());
    expect(savedConfig().source_name).toBe('s2');
  });

  test('shows the backend error and stays open when the save fails', async () => {
    act(() => {
      useStore.setState({
        saveDefaults: jest.fn().mockResolvedValue({ success: false, error: 'bad yaml' }),
      });
    });
    const onClose = jest.fn();
    renderWithClose({}, onClose);
    clickSave();
    expect(await screen.findByText('bad yaml')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(getAction('checkCommitStatus')).not.toHaveBeenCalled();
  });

  test('surfaces a thrown save error and resets the saving state', async () => {
    act(() => {
      useStore.setState({ saveDefaults: jest.fn().mockRejectedValue(new Error('exploded')) });
    });
    const onClose = jest.fn();
    renderWithClose({}, onClose);
    clickSave();
    expect(await screen.findByText('exploded')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});

describe('ProjectDefaultsEditForm level editing', () => {
  beforeEach(seedStore);

  const oneLevel = { levels: [{ title: 'Exec', description: 'top' }] };

  test('filters levels missing a title or description out of the payload', async () => {
    renderWithClose(oneLevel);
    fireEvent.click(screen.getByRole('button', { name: /Add Level/ }));
    expect(titleValues()).toEqual(['Exec', '']);
    fireEvent.change(screen.getAllByPlaceholderText('Title')[1], {
      target: { value: 'HalfDone' },
    });
    clickSave();
    await waitFor(() => expect(getAction('saveDefaults')).toHaveBeenCalled());
    expect(savedConfig().levels).toEqual([{ title: 'Exec', description: 'top' }]);
  });

  test('edits existing levels and includes a fully filled new level', async () => {
    renderWithClose(oneLevel);
    fireEvent.change(screen.getAllByPlaceholderText('Title')[0], { target: { value: 'Execs' } });
    fireEvent.change(screen.getAllByPlaceholderText('Description')[0], {
      target: { value: 'topmost' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add Level/ }));
    fireEvent.change(screen.getAllByPlaceholderText('Title')[1], { target: { value: 'Ops' } });
    fireEvent.change(screen.getAllByPlaceholderText('Description')[1], {
      target: { value: 'mid' },
    });
    clickSave();
    await waitFor(() => expect(getAction('saveDefaults')).toHaveBeenCalled());
    expect(savedConfig().levels).toEqual([
      { title: 'Execs', description: 'topmost' },
      { title: 'Ops', description: 'mid' },
    ]);
  });

  test('removing all levels shows the empty state and omits levels from the payload', async () => {
    renderWithClose({
      levels: [
        { title: 'Exec', description: 'top' },
        { title: 'Ops', description: 'mid' },
      ],
    });
    // Click the icon; the event bubbles to the remove <button>.
    fireEvent.click(screen.getAllByTestId('RemoveIcon')[0]);
    expect(titleValues()).toEqual(['Ops']);
    fireEvent.click(screen.getAllByTestId('RemoveIcon')[0]);
    expect(screen.getByText('No dashboard levels defined.')).toBeInTheDocument();
    clickSave();
    await waitFor(() => expect(getAction('saveDefaults')).toHaveBeenCalled());
    expect(savedConfig()).not.toHaveProperty('levels');
  });
});
