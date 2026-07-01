/**
 * DefaultsEditForm tests (VIS-809 / Track M M-3).
 *
 * Thin wrapper that fronts <ProjectDefaultsEditForm> with a <SelectionChip> in
 * the right rail. Verifies the chip identity + that the resolved `defaults`
 * record is passed through to the underlying form, which self-fetches when the
 * store has none yet.
 */
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import DefaultsEditForm from './DefaultsEditForm';
import useStore from '../../../stores/store';

jest.mock('./ProjectDefaultsEditForm', () => ({
  __esModule: true,
  default: ({ defaults }) => (
    <div data-testid="project-defaults-form-stub">
      {`defaults:${defaults ? defaults.source_name || 'set' : 'none'}`}
    </div>
  ),
}));

const seed = (overrides = {}) => {
  act(() => {
    useStore.setState({
      defaults: { source_name: 'local-duckdb', threads: 4 },
      fetchDefaults: jest.fn(),
      ...overrides,
    });
  });
};

describe('DefaultsEditForm', () => {
  test('renders the defaults chip and passes defaults through to the form', () => {
    seed();
    render(<DefaultsEditForm name="analytics" />);
    expect(screen.getByTestId('right-rail-edit-defaults')).toBeInTheDocument();
    const chip = screen.getByTestId('right-rail-selection-chip');
    expect(chip).toHaveAttribute('data-object-type', 'defaults');
    expect(chip).toHaveTextContent('analytics');
    expect(screen.getByTestId('project-defaults-form-stub')).toHaveTextContent(
      'defaults:local-duckdb'
    );
  });

  test('self-fetches defaults when the store has none', async () => {
    const fetchDefaults = jest.fn();
    seed({ defaults: null, fetchDefaults });
    render(<DefaultsEditForm name="analytics" />);
    await waitFor(() => expect(fetchDefaults).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('project-defaults-form-stub')).toHaveTextContent('defaults:none');
  });
});
