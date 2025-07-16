import React from 'react';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import CircularProgress from '@mui/material/CircularProgress';
import { Tooltip } from 'flowbite-react';
import { ItemLabel, ItemIcon, StatusIcon, LoadingLabel } from '../styles/TreeStyles';
import { createSourceNodeId } from '../utils/nodeIdUtils';
import { useTreeContext } from '../TreeContext';
import DatabaseNode from './DatabaseNode';
import Pill from '../../common/Pill';

const SourceNode = ({ source }) => {
  const { sourcesMetadata, loadingStates } = useTreeContext();

  const nodeId = createSourceNodeId(source.name);
  const databases = sourcesMetadata.loadedDatabases[source.name];
  const isLoadingDatabases = loadingStates.databases[source.name];
  const isTestingConnection = loadingStates.connections[source.name];

  const sourceLabel = (
    <div style={{ marginRight: '8px', marginLeft: '8px', marginTop: '4px', marginBottom: '4px' }}>
      <Pill name={source.name}>
        {isTestingConnection ? (
          <CircularProgress size={16} />
        ) : source.status === 'connection_failed' ? (
          <Tooltip content={source.error || 'Connection failed'}>
            <StatusIcon>
              <CancelIcon fontSize="small" style={{ color: '#dc2626' }} />
            </StatusIcon>
          </Tooltip>
        ) : source.status === 'connected' ? (
          <Tooltip content="Connected">
            <StatusIcon>
              <CheckCircleIcon fontSize="small" style={{ color: '#059669' }} />
            </StatusIcon>
          </Tooltip>
        ) : (
          <Tooltip content="Connection not tested">
            <StatusIcon>
              <HelpOutlineIcon fontSize="small" style={{ color: '#6b7280' }} />
            </StatusIcon>
          </Tooltip>
        )}
        {isLoadingDatabases && <CircularProgress size={14} />}
      </Pill>
    </div>
  );

  return (
    <TreeItem itemId={nodeId} label={sourceLabel}>
      {source.status === 'connection_failed' && source.error ? (
        <TreeItem
          itemId={`${nodeId}-error`}
          label={
            <ItemLabel>
              <ItemIcon>
                <ErrorOutlineIcon fontSize="small" color="error" />
              </ItemIcon>
              <span style={{ color: '#dc2626', fontSize: '13px' }}>{source.error}</span>
            </ItemLabel>
          }
        />
      ) : databases ? (
        databases.map(db => <DatabaseNode key={db.name} database={db} sourceName={source.name} />)
      ) : (
        !isLoadingDatabases &&
        !source.error && (
          <TreeItem
            itemId={`${nodeId}-empty`}
            label={<LoadingLabel>Click to load databases</LoadingLabel>}
          />
        )
      )}
    </TreeItem>
  );
};

export default SourceNode;
