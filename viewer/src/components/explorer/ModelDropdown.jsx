import React from 'react';
import CreatableSelect from 'react-select/creatable';
import { components } from 'react-select';
import { Tooltip } from '@mui/material';
import Pill from '../common/Pill';
import { HiOutlineDatabase, HiChevronDown, HiPencil } from 'react-icons/hi';
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

// Custom SingleValue component that renders the model content
const SingleValue = ({ data, isModified, ...props }) => {
  const namedChildren = useStore(state => state.namedChildren);
  const modelData = namedChildren[data.name];
  const typeConfig = TYPE_STYLE_MAP[modelData?.type] || {
    bg: 'bg-purple-100',
    text: 'text-purple-800',
    border: 'border-purple-200',
    icon: HiOutlineDatabase,
  };

  const Icon = typeConfig.icon;

  return (
    <components.SingleValue {...props}>
      <Tooltip
        title={`Model: ${data.name}${isModified ? ' (modified)' : ''}`}
        placement="bottom"
        arrow
      >
        <div
          className={`flex items-center justify-between p-2 shadow-md rounded-2xl border ${typeConfig.bg} ${typeConfig.border} cursor-pointer relative`}
        >
          <div className="flex items-center min-w-0 flex-1">
            <Icon className={`w-5 h-5 mr-2 ${typeConfig.text}`} />
            <span className={`text-sm font-medium ${typeConfig.text} truncate`}>{data.name}</span>
          </div>
          {isModified && (
            <div
              className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full border-2 border-white"
              title="Model has been modified"
            />
          )}
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

// Custom Placeholder component that looks like a pill with input
const Placeholder = props => {
  return (
    <components.Placeholder {...props}>
      <div className="flex items-center justify-between p-2 shadow-md rounded-2xl border bg-gray-100 border-gray-200 min-w-full">
        <div className="flex items-center flex-1 min-w-0">
          <HiPencil className="w-5 h-5 mr-2 text-gray-600 flex-shrink-0" />
          <span className="text-sm font-medium text-gray-500 italic">type to create model...</span>
        </div>
        <HiChevronDown className="w-4 h-4 ml-2 text-gray-600 flex-shrink-0" />
      </div>
    </components.Placeholder>
  );
};

const ModelDropdown = ({ associatedModel, onModelChange, isLoading, isModified = false }) => {
  const namedChildren = useStore(state => state.namedChildren);

  // Get SQL models from namedChildren (not CsvScript or LocalMerge)
  const models = Object.values(namedChildren || {}).filter(
    item => item.type_key === 'models' && item.type === 'SqlModel'
  );

  // Map models to options format expected by react-select
  const options = models.map(model => ({
    name: model.config.name,
    value: model.config.name,
    label: model.config.name,
  }));

  const selectedOption = associatedModel
    ? { name: associatedModel, value: associatedModel, label: associatedModel }
    : null;

  const handleChange = (option, actionMeta) => {
    if (actionMeta.action === 'create-option' || actionMeta.action === 'select-option') {
      if (option && onModelChange) {
        onModelChange(option.name || option.value);
      }
    } else if (actionMeta.action === 'clear') {
      if (onModelChange) {
        onModelChange(null);
      }
    }
  };

  const handleCreate = inputValue => {
    if (onModelChange) {
      onModelChange(inputValue);
    }
  };

  // Custom styles for react-select to match our design
  const customStyles = {
    control: base => ({
      ...base,
      backgroundColor: 'transparent',
      border: 'none',
      boxShadow: 'none',
      minHeight: '48px',
      height: '48px',
      cursor: 'pointer',
      padding: 0,
      overflow: 'visible',
      display: 'flex',
      alignItems: 'center',
      '&:hover': {
        border: 'none',
      },
    }),
    valueContainer: base => ({
      ...base,
      padding: 0,
      overflow: 'visible',
      display: 'flex',
      alignItems: 'center',
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
      zIndex: 1000,
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
      padding: '0.5rem',
      fontSize: '0.875rem',
      color: '#4b5563',
    }),
  };

  return (
    <div className="flex items-center justify-center min-w-[180px] md:min-w-[220px]">
      <CreatableSelect
        className="w-full"
        value={selectedOption}
        onChange={handleChange}
        onCreateOption={handleCreate}
        options={options}
        isSearchable={true}
        isDisabled={isLoading}
        isClearable={true}
        components={{
          Option,
          SingleValue: props => <SingleValue {...props} isModified={isModified} />,
          Control,
          DropdownIndicator,
          IndicatorSeparator: () => null,
          Placeholder,
        }}
        styles={customStyles}
        menuPlacement="auto"
        menuPosition="fixed"
        formatCreateLabel={inputValue => `Create model: ${inputValue}`}
      />
    </div>
  );
};

export default ModelDropdown;
