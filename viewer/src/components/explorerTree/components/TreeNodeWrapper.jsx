import React from 'react';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import CircularProgress from '@mui/material/CircularProgress';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { ItemLabel, LoadingLabel, ItemIcon } from '../styles/TreeStyles';

/**
 * Generic wrapper component for tree nodes that handles loading and error states
 *
 * @param {Object} props
 * @param {string} props.nodeId - Unique identifier for the tree node
 * @param {React.ReactNode} props.label - Label to display for the node
 * @param {boolean} props.isLoading - Whether data is currently loading
 * @param {Object} props.error - Error object if data loading failed
 * @param {React.ReactNode} props.children - Child nodes to render when not loading/error
 * @param {string} props.loadingText - Text to display while loading (default: "Loading...")
 * @param {string} props.errorText - Text to display on error (default: "Connection failed")
 * @param {string} props.placeholderText - Text for empty state (default: "Click to expand")
 * @param {boolean} props.showPlaceholder - Whether to show placeholder when empty
 */
const TreeNodeWrapper = ({
  nodeId,
  label,
  isLoading = false,
  error = null,
  children,
  loadingText = 'Loading...',
  errorText = 'Connection failed',
  placeholderText = 'Click to expand',
  showPlaceholder = true,
}) => {
  // Render error state
  if (error) {
    return (
      <TreeItem itemId={nodeId} label={label}>
        <TreeItem
          itemId={`${nodeId}-error`}
          label={
            <ItemLabel>
              <ItemIcon>
                <ErrorOutlineIcon fontSize="small" color="error" />
              </ItemIcon>
              <span style={{ color: '#dc2626', fontSize: '13px' }}>{errorText}</span>
            </ItemLabel>
          }
        />
      </TreeItem>
    );
  }

  // Render loading state
  if (isLoading && !children) {
    return (
      <TreeItem itemId={nodeId} label={label}>
        <TreeItem
          itemId={`${nodeId}-loading`}
          label={
            <ItemLabel>
              <CircularProgress size={12} />
              <LoadingLabel>{loadingText}</LoadingLabel>
            </ItemLabel>
          }
        />
      </TreeItem>
    );
  }

  // Render children if present
  if (children && React.Children.count(children) > 0) {
    return (
      <TreeItem itemId={nodeId} label={label}>
        {children}
      </TreeItem>
    );
  }

  // Render placeholder for empty state
  if (showPlaceholder) {
    return (
      <TreeItem itemId={nodeId} label={label}>
        <TreeItem
          itemId={`${nodeId}-placeholder`}
          label={<LoadingLabel>{placeholderText}</LoadingLabel>}
        />
      </TreeItem>
    );
  }

  // Just render the node without children
  return <TreeItem itemId={nodeId} label={label} />;
};

export default TreeNodeWrapper;
