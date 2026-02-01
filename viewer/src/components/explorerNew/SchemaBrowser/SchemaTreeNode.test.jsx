import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SchemaTreeNode from './SchemaTreeNode';
import { PiDatabase, PiTable } from 'react-icons/pi';

describe('SchemaTreeNode', () => {
  const defaultProps = {
    icon: <PiDatabase size={14} />,
    label: 'test_source',
    type: 'source',
    onClick: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders label and icon', () => {
    render(<SchemaTreeNode {...defaultProps} />);
    expect(screen.getByText('test_source')).toBeInTheDocument();
  });

  test('shows caret right when collapsed and expandable', () => {
    render(
      <SchemaTreeNode {...defaultProps} isExpanded={false}>
        <div>child</div>
      </SchemaTreeNode>
    );
    expect(screen.getByTestId('tree-node-source-test_source')).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  test('shows caret down when expanded', () => {
    render(
      <SchemaTreeNode {...defaultProps} isExpanded={true}>
        <div>child</div>
      </SchemaTreeNode>
    );
    expect(screen.getByTestId('tree-node-source-test_source')).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  test('shows spinner when isLoading is true', () => {
    render(<SchemaTreeNode {...defaultProps} isLoading={true} />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  test('shows badge when provided', () => {
    render(<SchemaTreeNode {...defaultProps} badge="NEW" />);
    expect(screen.getByText('NEW')).toBeInTheDocument();
  });

  test('shows action buttons on hover', () => {
    const actionClick = jest.fn();
    render(
      <SchemaTreeNode
        {...defaultProps}
        actions={[{ label: 'Create Model', onClick: actionClick }]}
      />
    );
    const button = screen.getByTestId('action-Create Model');
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(actionClick).toHaveBeenCalledTimes(1);
    expect(defaultProps.onClick).not.toHaveBeenCalled();
  });

  test('calls onClick when clicked', () => {
    render(<SchemaTreeNode {...defaultProps} />);
    fireEvent.click(screen.getByTestId('tree-node-source-test_source'));
    expect(defaultProps.onClick).toHaveBeenCalledTimes(1);
  });

  test('calls onDoubleClick when double-clicked', () => {
    const onDoubleClick = jest.fn();
    render(<SchemaTreeNode {...defaultProps} onDoubleClick={onDoubleClick} />);
    fireEvent.doubleClick(screen.getByTestId('tree-node-source-test_source'));
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
  });

  test('renders children when isExpanded is true', () => {
    render(
      <SchemaTreeNode {...defaultProps} isExpanded={true}>
        <div data-testid="child-node">Child Content</div>
      </SchemaTreeNode>
    );
    expect(screen.getByTestId('child-node')).toBeInTheDocument();
  });

  test('hides children when isExpanded is false', () => {
    render(
      <SchemaTreeNode {...defaultProps} isExpanded={false}>
        <div data-testid="child-node">Child Content</div>
      </SchemaTreeNode>
    );
    expect(screen.queryByTestId('child-node')).not.toBeInTheDocument();
  });

  test('applies correct indentation per level', () => {
    render(<SchemaTreeNode {...defaultProps} level={0} />);
    const node0 = screen.getByTestId('tree-node-source-test_source');
    expect(node0.style.paddingLeft).toBe('8px');
  });

  test('applies correct indentation for deeper level', () => {
    render(<SchemaTreeNode {...defaultProps} label="deep_node" level={3} />);
    const node3 = screen.getByTestId('tree-node-source-deep_node');
    expect(node3.style.paddingLeft).toBe('56px');
  });

  test('shows error icon with tooltip when errorMessage is set', () => {
    render(<SchemaTreeNode {...defaultProps} errorMessage="Connection refused" />);
    const errorIcon = screen.getByTestId('error-icon');
    expect(errorIcon).toBeInTheDocument();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    const row = screen.getByTestId('tree-node-source-test_source');
    expect(row).toHaveAttribute('title', 'Connection refused');
  });

  test('column type nodes do not show aria-expanded', () => {
    render(
      <SchemaTreeNode
        icon={<PiTable size={14} />}
        label="id"
        type="column"
        badge="INTEGER"
        level={5}
      />
    );
    expect(screen.getByTestId('tree-node-column-id')).not.toHaveAttribute('aria-expanded');
  });
});
