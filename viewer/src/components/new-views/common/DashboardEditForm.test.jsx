import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DashboardEditForm from './DashboardEditForm';
import useStore from '../../../stores/store';

jest.mock('../../../stores/store');

describe('DashboardEditForm', () => {
  const setupStore = (overrides = {}) => {
    useStore.mockImplementation(selector => {
      const state = {
        deleteDashboard: jest.fn().mockResolvedValue({ success: true }),
        checkPublishStatus: jest.fn().mockResolvedValue(undefined),
        charts: [],
        tables: [],
        markdowns: [],
        inputs: [],
        ...overrides,
      };
      return typeof selector === 'function' ? selector(state) : state;
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setupStore();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
  });

  // ---------- Name field is editable in edit mode (VIS-749) ----------

  describe('Name field editability', () => {
    it('does not disable the Name input in edit mode', () => {
      const dashboard = {
        name: 'sales-summary',
        config: { name: 'sales-summary', rows: [] },
      };
      render(
        <DashboardEditForm
          dashboard={dashboard}
          isCreate={false}
          onSave={jest.fn()}
          onClose={jest.fn()}
        />,
      );

      const nameInput = screen.getByLabelText('Name');
      expect(nameInput).not.toBeDisabled();
      expect(nameInput).toHaveValue('sales-summary');
    });

    it('shows the rename helper text when the user types a different name', () => {
      const dashboard = {
        name: 'sales-summary',
        config: { name: 'sales-summary', rows: [] },
      };
      render(
        <DashboardEditForm
          dashboard={dashboard}
          isCreate={false}
          onSave={jest.fn()}
          onClose={jest.fn()}
        />,
      );

      const nameInput = screen.getByLabelText('Name');
      fireEvent.change(nameInput, { target: { value: 'sales-overview' } });

      expect(screen.getByText(/Will rename 'sales-summary' on save/)).toBeInTheDocument();
    });

    it('hides the rename helper text when the name matches the original', () => {
      const dashboard = {
        name: 'sales-summary',
        config: { name: 'sales-summary', rows: [] },
      };
      render(
        <DashboardEditForm
          dashboard={dashboard}
          isCreate={false}
          onSave={jest.fn()}
          onClose={jest.fn()}
        />,
      );

      // Name is unchanged — no helper.
      expect(screen.queryByText(/Will rename/)).not.toBeInTheDocument();
    });
  });

  // ---------- Rename confirmation flow ----------

  describe('Rename confirmation flow', () => {
    const dashboard = {
      name: 'sales-summary',
      config: { name: 'sales-summary', rows: [] },
    };

    it('hits the preview endpoint and shows a confirmation dialog on save', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ valid: true, rewritten_ref_count: 0 }),
      });

      const onSave = jest.fn();
      render(
        <DashboardEditForm
          dashboard={dashboard}
          isCreate={false}
          onSave={onSave}
          onClose={jest.fn()}
        />,
      );

      const nameInput = screen.getByLabelText('Name');
      fireEvent.change(nameInput, { target: { value: 'sales-overview' } });
      fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/dashboards/sales-summary/preview-rename/?new_name=sales-overview',
        );
      });

      // Confirmation dialog renders.
      expect(await screen.findByTestId('rename-confirm-button')).toBeInTheDocument();
      expect(screen.getByTestId('rename-cancel-button')).toBeInTheDocument();
      // The save flow does NOT call onSave when a rename is pending.
      expect(onSave).not.toHaveBeenCalled();
    });

    it('shows the ref-count message when rewritten_ref_count > 0', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ valid: true, rewritten_ref_count: 3 }),
      });

      render(
        <DashboardEditForm
          dashboard={dashboard}
          isCreate={false}
          onSave={jest.fn()}
          onClose={jest.fn()}
        />,
      );

      fireEvent.change(screen.getByLabelText('Name'), {
        target: { value: 'sales-overview' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

      const message = await screen.findByTestId('rename-ref-count-message');
      expect(message.textContent).toMatch(/will also update 3 references/);
    });

    it('uses singular "reference" for a count of 1', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ valid: true, rewritten_ref_count: 1 }),
      });

      render(
        <DashboardEditForm
          dashboard={dashboard}
          isCreate={false}
          onSave={jest.fn()}
          onClose={jest.fn()}
        />,
      );

      fireEvent.change(screen.getByLabelText('Name'), {
        target: { value: 'sales-overview' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

      const message = await screen.findByTestId('rename-ref-count-message');
      expect(message.textContent).toMatch(/will also update 1 reference[^s]/);
    });

    it('shows the no-other-files message when count is 0', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ valid: true, rewritten_ref_count: 0 }),
      });

      render(
        <DashboardEditForm
          dashboard={dashboard}
          isCreate={false}
          onSave={jest.fn()}
          onClose={jest.fn()}
        />,
      );

      fireEvent.change(screen.getByLabelText('Name'), {
        target: { value: 'sales-overview' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

      const message = await screen.findByTestId('rename-ref-count-message');
      expect(message.textContent).toMatch(/No other objects reference this dashboard/);
    });

    it('surfaces the preview error and aborts the save flow', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          valid: false,
          error: "'sales-overview' is already used by another dashboard",
        }),
      });

      const onSave = jest.fn();
      render(
        <DashboardEditForm
          dashboard={dashboard}
          isCreate={false}
          onSave={onSave}
          onClose={jest.fn()}
        />,
      );

      fireEvent.change(screen.getByLabelText('Name'), {
        target: { value: 'sales-overview' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

      await waitFor(() => {
        expect(
          screen.getByText("'sales-overview' is already used by another dashboard"),
        ).toBeInTheDocument();
      });
      expect(onSave).not.toHaveBeenCalled();
    });

    it('confirms the rename via the rename endpoint and closes the form', async () => {
      // First call: preview-rename
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ valid: true, rewritten_ref_count: 0 }),
      });
      // Second call: rename
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          old_name: 'sales-summary',
          new_name: 'sales-overview',
          status: 'new',
          rewritten_ref_count: 0,
        }),
      });

      const onClose = jest.fn();
      render(
        <DashboardEditForm
          dashboard={dashboard}
          isCreate={false}
          onSave={jest.fn()}
          onClose={onClose}
        />,
      );

      fireEvent.change(screen.getByLabelText('Name'), {
        target: { value: 'sales-overview' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

      const confirmButton = await screen.findByTestId('rename-confirm-button');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/dashboards/sales-summary/rename/',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_name: 'sales-overview' }),
          }),
        );
      });

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('cancels the rename and restores the original name', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ valid: true, rewritten_ref_count: 0 }),
      });

      render(
        <DashboardEditForm
          dashboard={dashboard}
          isCreate={false}
          onSave={jest.fn()}
          onClose={jest.fn()}
        />,
      );

      fireEvent.change(screen.getByLabelText('Name'), {
        target: { value: 'sales-overview' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

      const cancelButton = await screen.findByTestId('rename-cancel-button');
      fireEvent.click(cancelButton);

      // After cancel, the input is restored to the original name and the
      // confirmation dialog is gone.
      await waitFor(() => {
        expect(screen.queryByTestId('rename-confirm-button')).not.toBeInTheDocument();
      });
      expect(screen.getByLabelText('Name')).toHaveValue('sales-summary');
    });

    it('surfaces a server error on rename failure', async () => {
      // Preview succeeds...
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ valid: true, rewritten_ref_count: 0 }),
      });
      // ...but the actual rename fails.
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: jest.fn().mockResolvedValue({ error: 'Server exploded' }),
      });

      const onClose = jest.fn();
      render(
        <DashboardEditForm
          dashboard={dashboard}
          isCreate={false}
          onSave={jest.fn()}
          onClose={onClose}
        />,
      );

      fireEvent.change(screen.getByLabelText('Name'), {
        target: { value: 'sales-overview' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
      fireEvent.click(await screen.findByRole('button', { name: /Confirm Rename/ }));

      await waitFor(() => {
        expect(screen.getByText('Server exploded')).toBeInTheDocument();
      });
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
