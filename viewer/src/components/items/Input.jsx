import Dropdown from './inputs/Dropdown';
import useStore from '../../stores/store';
import { useInputOptions } from '../../hooks/useInputOptions';

export const DROPDOWN = 'dropdown';

const Input = ({ input, itemWidth, project }) => {
  const setInputValue = useStore(state => state.setInputValue);
  const setDefaultInputValue = useStore(state => state.setDefaultInputValue);

  // Load options from parquet (or use static options)
  const options = useInputOptions(input, project?.id);

  if (!input) return null;

  return (
    <div className={`grow-${itemWidth} p-2 m-auto flex`}>
      <div className="m-auto justify-center">
        {input.type === DROPDOWN && (
          <Dropdown
            label={input?.label}
            options={options}
            isMulti={input?.multi}
            defaultValue={input?.default}
            name={input.name}
            isQuery={input?.is_query}
            setInputValue={setInputValue}
            setDefaultInputValue={setDefaultInputValue}
          />
        )}
      </div>
    </div>
  );
};

export default Input;
