import Dropdown from './inputs/Dropdown';
import useStore from '../../stores/store';
import { useInputOptions } from '../../hooks/useInputOptions';

// Legacy type constant for backwards compatibility
export const DROPDOWN = 'dropdown';

// New input type constants
export const SINGLE_SELECT = 'single-select';
export const MULTI_SELECT = 'multi-select';

const Input = ({ input, itemWidth, project }) => {
  const setInputValue = useStore(state => state.setInputValue);
  const setDefaultInputValue = useStore(state => state.setDefaultInputValue);

  // Load options from JSON (or use static options)
  const options = useInputOptions(input, project?.id);

  if (!input) return null;

  // Determine display type and input type
  const displayType = input.display?.type || 'dropdown';
  const inputType = input.type || DROPDOWN;

  // Determine if multi-select based on input type or legacy 'multi' flag
  const isMulti = inputType === MULTI_SELECT || input?.multi === true;

  // Wrapper for setInputValue that passes the input type
  const handleSetInputValue = (name, value) => {
    setInputValue(name, value, isMulti ? MULTI_SELECT : SINGLE_SELECT);
  };

  // Wrapper for setDefaultInputValue that passes the input type
  const handleSetDefaultInputValue = (name, value) => {
    setDefaultInputValue(name, value, isMulti ? MULTI_SELECT : SINGLE_SELECT);
  };

  // Get default value from display config or input config
  const defaultValue = input.display?.default?.value || input?.default;

  // Render the appropriate component based on type
  const renderInputComponent = () => {
    // For now, all types use Dropdown - can be extended for other display types
    // (radio, toggle, tabs, checkboxes, slider, etc.)
    switch (displayType) {
      case 'dropdown':
      default:
        return (
          <Dropdown
            label={input?.label}
            options={options}
            isMulti={isMulti}
            defaultValue={defaultValue}
            name={input.name}
            isQuery={input?.is_query}
            setInputValue={handleSetInputValue}
            setDefaultInputValue={handleSetDefaultInputValue}
          />
        );
    }
  };

  // Support old 'dropdown' type and new 'single-select'/'multi-select' types
  const shouldRender =
    inputType === DROPDOWN || inputType === SINGLE_SELECT || inputType === MULTI_SELECT;

  if (!shouldRender) return null;

  return (
    <div className={`grow-${itemWidth} p-2 m-auto flex`}>
      <div className="m-auto justify-center">{renderInputComponent()}</div>
    </div>
  );
};

export default Input;
