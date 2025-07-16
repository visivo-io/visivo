import React from 'react';
import Select, { components } from 'react-select';
import { Tooltip } from '@mui/material';
import Pill from '../common/Pill';
import { HiOutlineDatabase, HiChevronDown } from 'react-icons/hi';
import { TYPE_STYLE_MAP } from '../styled/VisivoObjectStyles';
import useStore from '../../stores/store';

// Custom Option component that renders Pill
const Option = props => {
  const { data } = props;
  return (
    <components.Option {...props}>
      <div className="py-1">
        <Pill name={data.name} />
      </div>
    </components.Option>
  );
};

// Custom SingleValue component that renders the source content
const SingleValue = ({ data, ...props }) => {
  const namedChildren = useStore(state => state.namedChildren);
  const sourceData = namedChildren[data.name];
  const typeConfig = TYPE_STYLE_MAP[sourceData?.type] || {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-200',
    icon: HiOutlineDatabase,
  };

  const Icon = typeConfig.icon;

  return (
    <components.SingleValue {...props}>
      <Tooltip
        title="This is the source that queries are running against currently"
        placement="bottom"
        arrow
      >
        <div
          className={`flex items-center justify-between p-2 shadow-md rounded-2xl border ${typeConfig.bg} ${typeConfig.border} cursor-pointer`}
        >
          <div className="flex items-center min-w-0 flex-1">
            <Icon className={`w-5 h-5 mr-2 ${typeConfig.text}`} />
            <span className={`text-sm font-medium ${typeConfig.text} truncate`}>{data.name}</span>
          </div>
          <HiChevronDown className={`w-4 h-4 ml-2 ${typeConfig.text}`} />
        </div>
      </Tooltip>
    </components.SingleValue>
  );
};

// Custom Control component to remove default styling
const Control = props => {
  return (
    <div className="relative">
      <components.Control {...props}>{props.children}</components.Control>
    </div>
  );
};

// Hide the default dropdown indicator
const DropdownIndicator = () => null;

const SourceDropdown = ({ selectedSource, onSourceChange, isLoading }) => {
  const namedChildren = useStore(state => state.namedChildren);

  // Get sources from namedChildren
  const sources = Object.values(namedChildren || {}).filter(item => item.type_key === 'sources');

  // Map sources to options format expected by react-select
  const options = sources.map(source => ({
    name: source.config.name,
    value: source.config.name,
    label: source.config.name,
  }));

  const selectedOption = options.find(opt => opt.name === selectedSource?.name) || null;

  const handleChange = option => {
    if (option && onSourceChange) {
      // Pass the source config to the handler
      const sourceData = namedChildren[option.name];
      if (sourceData) {
        onSourceChange(sourceData.config);
      }
    }
  };

  // Custom styles for react-select to match our design
  const customStyles = {
    control: base => ({
      ...base,
      backgroundColor: 'transparent',
      border: 'none',
      boxShadow: 'none',
      minHeight: 'auto',
      cursor: 'pointer',
      padding: 0,
      '&:hover': {
        border: 'none',
      },
    }),
    valueContainer: base => ({
      ...base,
      padding: 0,
    }),
    indicatorSeparator: () => ({
      display: 'none',
    }),
    dropdownIndicator: () => ({
      display: 'none',
    }),
    menu: base => ({
      ...base,
      marginTop: 4,
      borderRadius: '0.5rem',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      overflow: 'hidden',
    }),
    menuList: base => ({
      ...base,
      padding: '0.5rem',
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected
        ? 'transparent'
        : state.isFocused
          ? 'transparent'
          : 'transparent',
      color: 'inherit',
      padding: 0,
      cursor: 'pointer',
      '&:active': {
        backgroundColor: 'transparent',
      },
    }),
    singleValue: () => ({
      margin: 0,
      maxWidth: '100%',
      position: 'static',
      transform: 'none',
    }),
    input: base => ({
      ...base,
      margin: 0,
      padding: 0,
    }),
  };

  return (
    <div className="flex items-center justify-center">
      <Select
        value={selectedOption}
        onChange={handleChange}
        options={options}
        isSearchable={false}
        isDisabled={isLoading}
        components={{
          Option,
          SingleValue,
          Control,
          DropdownIndicator,
          IndicatorSeparator: () => null,
        }}
        styles={customStyles}
        menuPlacement="auto"
        menuPosition="fixed"
        placeholder={
          <div className="flex items-center justify-between p-2 shadow-md rounded-2xl border bg-gray-100 border-gray-200">
            <div className="flex items-center">
              <HiOutlineDatabase className="w-5 h-5 mr-2 text-gray-600" />
              <span className="text-sm font-medium text-gray-600">Select a source</span>
            </div>
            <HiChevronDown className="w-4 h-4 ml-2 text-gray-600" />
          </div>
        }
      />
    </div>
  );
};

export default SourceDropdown;
