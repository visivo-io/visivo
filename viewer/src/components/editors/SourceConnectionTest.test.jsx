import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SourceConnectionTest from './SourceConnectionTest';
import * as explorerApi from '../../api/explorer';

// Mock the API module
jest.mock('../../api/explorer');

// Mock console.error to avoid noise in tests
global.console.error = jest.fn();

describe('SourceConnectionTest', () => {
  const defaultProps = {
    objectName: 'test_source',
    selectedSource: { value: 'postgresql', label: 'PostgreSQL' },
    attributes: {
      host: 'localhost',
      database: 'test_db',
      username: 'user',
    },
    isVisible: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    console.error.mockClear();
  });

  describe('visibility conditions', () => {
    it('should not render when isVisible is false', () => {
      render(<SourceConnectionTest {...defaultProps} isVisible={false} />);

      expect(screen.queryByText('Connection Status')).not.toBeInTheDocument();
    });

    it('should not render for CSV sources', () => {
      render(
        <SourceConnectionTest {...defaultProps} selectedSource={{ value: 'csv', label: 'CSV' }} />
      );

      expect(screen.queryByText('Connection Status')).not.toBeInTheDocument();
    });

    it('should not render for Excel sources', () => {
      render(
        <SourceConnectionTest {...defaultProps} selectedSource={{ value: 'xls', label: 'Excel' }} />
      );

      expect(screen.queryByText('Connection Status')).not.toBeInTheDocument();
    });

    it('should render for database sources when visible', () => {
      render(<SourceConnectionTest {...defaultProps} />);

      expect(screen.getByText('Connection Status')).toBeInTheDocument();
      expect(screen.getByText('Test Connection')).toBeInTheDocument();
    });
  });

  describe('test connection button', () => {
    it('should be disabled when objectName is not provided', () => {
      render(<SourceConnectionTest {...defaultProps} objectName="" />);

      const button = screen.getByText('Test Connection');
      expect(button).toBeDisabled();
    });

    it('should be enabled when objectName is provided', () => {
      render(<SourceConnectionTest {...defaultProps} />);

      const button = screen.getByText('Test Connection');
      expect(button).not.toBeDisabled();
    });

    it('should show "Testing..." text when testing connection', async () => {
      explorerApi.testSourceConnectionFromConfig.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ status: 'connected' }), 100))
      );

      render(<SourceConnectionTest {...defaultProps} />);

      const button = screen.getByText('Test Connection');
      fireEvent.click(button);

      expect(screen.getByText('Testing...')).toBeInTheDocument();
      expect(button).toBeDisabled();

      await waitFor(() => {
        expect(screen.getByText('Test Connection')).toBeInTheDocument();
      });
    });
  });

  describe('connection testing', () => {
    it('should call API with correct source configuration', async () => {
      explorerApi.testSourceConnectionFromConfig.mockResolvedValue({
        status: 'connected',
      });

      render(<SourceConnectionTest {...defaultProps} />);

      const button = screen.getByText('Test Connection');
      fireEvent.click(button);

      await waitFor(() => {
        expect(explorerApi.testSourceConnectionFromConfig).toHaveBeenCalledWith({
          name: 'test_source',
          type: 'postgresql',
          host: 'localhost',
          database: 'test_db',
          username: 'user',
        });
      });
    });

    it('should display success status for successful connection', async () => {
      explorerApi.testSourceConnectionFromConfig.mockResolvedValue({
        status: 'connected',
      });

      const { container } = render(<SourceConnectionTest {...defaultProps} />);

      const button = screen.getByText('Test Connection');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Connection successful')).toBeInTheDocument();
      });

      // Check for green checkmark icon (using container for SVG access)
      // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
      const checkIcon = container.querySelector('svg.text-green-600 path[d="M5 13l4 4L19 7"]');
      expect(checkIcon).toBeInTheDocument();
    });

    it('should display failure status for failed connection', async () => {
      explorerApi.testSourceConnectionFromConfig.mockResolvedValue({
        status: 'connection_failed',
        error: 'Connection timeout',
      });

      const { container } = render(<SourceConnectionTest {...defaultProps} />);

      const button = screen.getByText('Test Connection');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Connection timeout')).toBeInTheDocument();
      });

      // Check for red X icon (using container for SVG access)
      // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
      const xIcon = container.querySelector('svg.text-red-600 path[d="M6 18L18 6M6 6l12 12"]');
      expect(xIcon).toBeInTheDocument();
    });

    it('should handle API errors gracefully', async () => {
      explorerApi.testSourceConnectionFromConfig.mockRejectedValue(new Error('Network error'));

      render(<SourceConnectionTest {...defaultProps} />);

      const button = screen.getByText('Test Connection');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('should handle API errors without message', async () => {
      explorerApi.testSourceConnectionFromConfig.mockRejectedValue(new Error());

      render(<SourceConnectionTest {...defaultProps} />);

      const button = screen.getByText('Test Connection');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Failed to test connection')).toBeInTheDocument();
      });
    });
  });

  describe('config change detection', () => {
    it('should clear test result when objectName changes', async () => {
      explorerApi.testSourceConnectionFromConfig.mockResolvedValue({
        status: 'connected',
      });

      const { rerender } = render(<SourceConnectionTest {...defaultProps} />);

      // Test connection first
      const button = screen.getByText('Test Connection');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Connection successful')).toBeInTheDocument();
      });

      // Change objectName
      rerender(<SourceConnectionTest {...defaultProps} objectName="different_source" />);

      // Result should be cleared
      await waitFor(() => {
        expect(screen.getByText('Connection not tested')).toBeInTheDocument();
      });
    });

    it('should clear test result when attributes change', async () => {
      explorerApi.testSourceConnectionFromConfig.mockResolvedValue({
        status: 'connected',
      });

      const { rerender } = render(<SourceConnectionTest {...defaultProps} />);

      // Test connection first
      const button = screen.getByText('Test Connection');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Connection successful')).toBeInTheDocument();
      });

      // Change attributes
      rerender(
        <SourceConnectionTest
          {...defaultProps}
          attributes={{
            ...defaultProps.attributes,
            host: 'different.host.com',
          }}
        />
      );

      // Result should be cleared
      await waitFor(() => {
        expect(screen.getByText('Connection not tested')).toBeInTheDocument();
      });
    });

    it('should clear test result when selectedSource changes', async () => {
      explorerApi.testSourceConnectionFromConfig.mockResolvedValue({
        status: 'connected',
      });

      const { rerender } = render(<SourceConnectionTest {...defaultProps} />);

      // Test connection first
      const button = screen.getByText('Test Connection');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Connection successful')).toBeInTheDocument();
      });

      // Change selectedSource
      rerender(
        <SourceConnectionTest
          {...defaultProps}
          selectedSource={{ value: 'mysql', label: 'MySQL' }}
        />
      );

      // Result should be cleared
      await waitFor(() => {
        expect(screen.getByText('Connection not tested')).toBeInTheDocument();
      });
    });

    it('should not show success status when config has changed after successful test', async () => {
      explorerApi.testSourceConnectionFromConfig.mockResolvedValue({
        status: 'connected',
      });

      const { rerender } = render(<SourceConnectionTest {...defaultProps} />);

      // Test connection first
      const button = screen.getByText('Test Connection');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Connection successful')).toBeInTheDocument();
      });

      // Change config but keep same test result
      rerender(
        <SourceConnectionTest
          {...defaultProps}
          attributes={{
            ...defaultProps.attributes,
            port: 5433,
          }}
        />
      );

      // Should not show success status since config changed
      expect(screen.queryByText('Connection successful')).not.toBeInTheDocument();
    });
  });

  describe('loading states', () => {
    it('should show loading spinner during connection test', async () => {
      explorerApi.testSourceConnectionFromConfig.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ status: 'connected' }), 100))
      );

      const { container } = render(<SourceConnectionTest {...defaultProps} />);

      const button = screen.getByText('Test Connection');
      fireEvent.click(button);

      // Check for loading spinner (using container for DOM access)
      // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Connection successful')).toBeInTheDocument();
      });
    });

    it('should show "Connection not tested" by default', () => {
      render(<SourceConnectionTest {...defaultProps} />);

      expect(screen.getByText('Connection not tested')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle undefined selectedSource gracefully', () => {
      render(<SourceConnectionTest {...defaultProps} selectedSource={undefined} />);

      const button = screen.getByText('Test Connection');
      fireEvent.click(button);

      expect(explorerApi.testSourceConnectionFromConfig).toHaveBeenCalledWith({
        name: 'test_source',
        type: undefined,
        host: 'localhost',
        database: 'test_db',
        username: 'user',
      });
    });

    it('should handle empty attributes object', () => {
      render(<SourceConnectionTest {...defaultProps} attributes={{}} />);

      const button = screen.getByText('Test Connection');
      fireEvent.click(button);

      expect(explorerApi.testSourceConnectionFromConfig).toHaveBeenCalledWith({
        name: 'test_source',
        type: 'postgresql',
      });
    });

    it('should not trigger test when objectName is missing', () => {
      render(<SourceConnectionTest {...defaultProps} objectName="" />);

      const button = screen.getByText('Test Connection');
      fireEvent.click(button);

      expect(explorerApi.testSourceConnectionFromConfig).not.toHaveBeenCalled();
    });
  });
});
