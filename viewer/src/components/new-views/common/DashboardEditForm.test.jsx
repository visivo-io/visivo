import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DashboardEditForm from './DashboardEditForm';
import useStore from '../../../stores/store';

jest.mock('../../../stores/store');

const mockOpenWorkspaceTab = jest.fn();
const mockDeleteDashboard = jest.fn();
const mockCheckPublishStatus = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  useStore.mockImplementation(selector => {
    const state = {
      deleteDashboard: mockDeleteDashboard,
      checkCommitStatus: mockCheckPublishStatus,
      openWorkspaceTab: mockOpenWorkspaceTab,
    };
    return typeof selector === 'function' ? selector(state) : state;
  });
});

const dashboardWithRows = {
  name: 'sales',
  status: 'published',
  config: {
    description: 'Sales overview',
    rows: [
      {
        height: 'large',
        items: [{ width: 2, chart: 'ref(rev_chart)' }, { width: 1 }],
      },
    ],
  },
};

describe('DashboardEditForm — bundled context (mounts RowEditForm per row)', () => {
  test('renders name, description, and a RowEditForm per configured row', () => {
    render(<DashboardEditForm dashboard={dashboardWithRows} isCreate={false} onSave={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByDisplayValue('sales')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Sales overview')).toBeInTheDocument();
    expect(screen.getByTestId('row-edit-form-0')).toBeInTheDocument();
    expect(screen.getByText('Row 1')).toBeInTheDocument();
    // Item slots are RefDropZones with the canonical id scheme.
    expect(screen.getByTestId('ref-dropzone-row-0-item-0')).toHaveAttribute('data-filled', 'true');
    expect(screen.getByTestId('ref-dropzone-row-0-item-1')).toHaveAttribute('data-filled', 'false');
  });

  test('the chart ref renders as a pill in its slot', () => {
    render(<DashboardEditForm dashboard={dashboardWithRows} isCreate={false} onSave={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByText('rev_chart')).toBeInTheDocument();
  });

  test('Add Row appends a row (identical behavior to before refactor)', () => {
    render(<DashboardEditForm dashboard={dashboardWithRows} isCreate={true} onSave={jest.fn()} onClose={jest.fn()} />);
    expect(screen.queryByTestId('row-edit-form-1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Add Row'));
    expect(screen.getByTestId('row-edit-form-1')).toBeInTheDocument();
  });

  test('empty dashboard shows the no-rows hint', () => {
    render(<DashboardEditForm dashboard={null} isCreate={true} onSave={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByText(/No rows defined/i)).toBeInTheDocument();
  });

  test('save serializes rows with refs in ref(...) form (unchanged contract)', async () => {
    const onSave = jest.fn().mockResolvedValue({ success: true });
    render(<DashboardEditForm dashboard={dashboardWithRows} isCreate={false} onSave={onSave} onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [objType, objName, config] = onSave.mock.calls[0];
    expect(objType).toBe('dashboard');
    expect(objName).toBe('sales');
    expect(config.rows).toHaveLength(1);
    expect(config.rows[0].height).toBe('large');
    // Only the populated item survives; width preserved; chart ref kept.
    expect(config.rows[0].items).toEqual([{ width: 2, chart: 'ref(rev_chart)' }]);
  });

  test('clicking a slot pill opens the referenced object via openWorkspaceTab', () => {
    render(<DashboardEditForm dashboard={dashboardWithRows} isCreate={false} onSave={jest.fn()} onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('rev_chart'));
    expect(mockOpenWorkspaceTab).toHaveBeenCalledWith({ type: 'chart', name: 'rev_chart' });
  });

  test('removing a slot pill clears the ref (slot reverts to empty)', () => {
    render(<DashboardEditForm dashboard={dashboardWithRows} isCreate={false} onSave={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByTestId('ref-dropzone-row-0-item-0')).toHaveAttribute('data-filled', 'true');
    fireEvent.click(screen.getByTestId('pill-remove'));
    expect(screen.getByTestId('ref-dropzone-row-0-item-0')).toHaveAttribute('data-filled', 'false');
  });

  test('Save button keeps the onboarding anchor data attribute', () => {
    render(<DashboardEditForm dashboard={dashboardWithRows} isCreate={true} onSave={jest.fn()} onClose={jest.fn()} />);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toHaveAttribute('data-onb-target', 'dashboard-save');
  });
});
