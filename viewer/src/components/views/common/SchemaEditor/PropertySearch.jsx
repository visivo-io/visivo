import React, { useState, useMemo } from 'react';
import {
  Box,
  TextField,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Checkbox,
  Typography,
  Chip,
  Collapse,
  IconButton,
  Paper,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DataObjectIcon from '@mui/icons-material/DataObject';
import { filterProperties } from './utils/schemaUtils';

/**
 * PropertySearch - Search and select properties to add to the form
 *
 * @param {object} props
 * @param {Array} props.properties - Flattened array of available properties
 * @param {Set} props.selectedPaths - Set of currently selected property paths
 * @param {function} props.onToggle - Handler when property is toggled (path) => void
 * @param {boolean} props.disabled - Whether the search is disabled
 */
export function PropertySearch({ properties = [], selectedPaths = new Set(), onToggle, disabled = false }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState(new Set([''])); // Root group expanded by default

  // Filter properties based on search
  const filteredProperties = useMemo(
    () => filterProperties(properties, searchQuery),
    [properties, searchQuery]
  );

  // Group properties by parent path
  const groupedProperties = useMemo(() => {
    const groups = {
      '': [], // Top-level properties
    };

    filteredProperties.forEach(prop => {
      const parts = prop.path.split('.');
      if (parts.length === 1) {
        groups[''].push(prop);
      } else {
        const parent = parts.slice(0, -1).join('.');
        if (!groups[parent]) {
          groups[parent] = [];
        }
        groups[parent].push(prop);
      }
    });

    return groups;
  }, [filteredProperties]);

  // Toggle group expansion
  const toggleGroup = group => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  // Handle property toggle
  const handleToggle = path => {
    if (!disabled) {
      onToggle(path);
    }
  };

  // Render a single property item
  const renderPropertyItem = prop => {
    const isSelected = selectedPaths.has(prop.path);
    const displayName = prop.path.split('.').pop();

    return (
      <ListItem key={prop.path} disablePadding dense>
        <ListItemButton
          onClick={() => handleToggle(prop.path)}
          disabled={disabled}
          dense
          // Keyed by full PATH, because the visible label is deliberately just
          // the leaf (`text` for `title.text`) and so is ambiguous across
          // groups — there is no unique user-facing handle to select by.
          data-testid={`property-option-${prop.path}`}
        >
          <ListItemIcon sx={{ minWidth: 36 }}>
            <Checkbox
              edge="start"
              checked={isSelected}
              tabIndex={-1}
              disableRipple
              disabled={disabled}
              size="small"
            />
          </ListItemIcon>
          <ListItemText
            primary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" component="span" sx={{ fontFamily: 'monospace' }}>
                  {displayName}
                </Typography>
                {prop.supportsQueryString && (
                  <Chip label="query" size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                )}
                {prop.isObject && (
                  <DataObjectIcon fontSize="small" sx={{ color: 'text.secondary', fontSize: 14 }} />
                )}
              </Box>
            }
            secondary={prop.description}
            secondaryTypographyProps={{ noWrap: true, variant: 'caption' }}
          />
        </ListItemButton>
      </ListItem>
    );
  };

  // Render a group of properties
  const renderGroup = (groupPath, groupProperties) => {
    if (groupProperties.length === 0) return null;

    const isExpanded = expandedGroups.has(groupPath);
    const selectedCount = groupProperties.filter(p => selectedPaths.has(p.path)).length;

    return (
      <Box key={groupPath}>
        {/* Group header (only for non-root groups) */}
        {groupPath && (
          <ListItem
            disablePadding
            sx={{
              bgcolor: 'grey.100',
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <ListItemButton onClick={() => toggleGroup(groupPath)} dense>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <IconButton size="small">
                  {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
                      {groupPath}
                    </Typography>
                    {selectedCount > 0 && (
                      <Chip
                        label={selectedCount}
                        size="small"
                        color="primary"
                        sx={{ height: 18, fontSize: '0.65rem' }}
                      />
                    )}
                  </Box>
                }
              />
            </ListItemButton>
          </ListItem>
        )}

        {/* Group properties */}
        <Collapse in={!groupPath || isExpanded}>
          <List disablePadding>
            {groupProperties.map(renderPropertyItem)}
          </List>
        </Collapse>
      </Box>
    );
  };

  // Get sorted group keys (root first, then alphabetically)
  const sortedGroupKeys = useMemo(() => {
    const keys = Object.keys(groupedProperties);
    // While BROWSING (no query), alphabetical is the right order — it's a
    // stable index you can scan.
    //
    // While SEARCHING it is actively harmful, and silently undid the relevance
    // ranking `filterProperties` computes: groups render in name order, so
    // `coloraxis.colorbar.title` sorts before `title` and the plot title lands
    // 130 rows down however well it scored. Order groups by their best-ranked
    // member instead — i.e. by where that member appears in the already-ranked
    // filtered list.
    if (!searchQuery.trim()) {
      return keys.sort((a, b) => {
        if (a === '') return -1;
        if (b === '') return 1;
        return a.localeCompare(b);
      });
    }

    const bestRank = new Map();
    filteredProperties.forEach((prop, index) => {
      const parts = prop.path.split('.');
      const group = parts.length === 1 ? '' : parts.slice(0, -1).join('.');
      if (!bestRank.has(group)) bestRank.set(group, index);
    });
    return keys.sort((a, b) => (bestRank.get(a) ?? Infinity) - (bestRank.get(b) ?? Infinity));
  }, [groupedProperties, filteredProperties, searchQuery]);

  return (
    <Paper
      variant="outlined"
      data-testid="property-search"
      sx={{ maxHeight: 400, display: 'flex', flexDirection: 'column' }}
    >
      {/* Search input */}
      <Box sx={{ p: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search properties..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          disabled={disabled}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* Properties list */}
      <Box sx={{ overflow: 'auto', flexGrow: 1 }}>
        {filteredProperties.length === 0 ? (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {searchQuery ? 'No matching properties found' : 'No properties available'}
            </Typography>
          </Box>
        ) : (
          <List disablePadding>
            {sortedGroupKeys.map(groupKey => renderGroup(groupKey, groupedProperties[groupKey]))}
          </List>
        )}
      </Box>

      {/* Footer with selection count */}
      <Box
        sx={{
          p: 1,
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: 'grey.50',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {/* Never "0 of 1366 properties selected" (ux-audit.md, pills #8): the
              raw schema size is an implementation detail of Plotly's trace
              spec, and leading with it makes an empty panel read as a task
              list 1,366 items long. Show a count only once the user has
              actually selected something, and say how many matched what they
              searched for rather than how big the schema is. */}
          {selectedPaths.size > 0
            ? `${selectedPaths.size} selected`
            : searchQuery
              ? `${filteredProperties.length} matching`
              : 'Search or browse to add properties'}
        </Typography>
      </Box>
    </Paper>
  );
}

export default PropertySearch;
