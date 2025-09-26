import React, { useEffect, useState } from 'react';
import Dropdown from './inputs/Dropdown';
import Loading from '../common/Loading';
import { runDuckDBQuery } from '../../duckdb/queries';
import { useDuckDB } from '../../contexts/DuckDBContext';
import useStore from '../../stores/store';

const DROPDOWN = 'dropdown';

const Input = ({ input, project, itemWidth }) => {
  const db = useDuckDB();
  const [componentData, setComponentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const setInputValue = useStore(state => state.setInputValue)
  const setDefaultInputValue = useStore(state => state.setDefaultInputValue)

  useEffect(() => {
    if (!input) return;

    const prepareComponent = async () => {
      setLoading(true);

      switch (input.type) {
        case DROPDOWN: {
          let options = [];
          let defaultValue;

          if (input?.is_query) {
            const result = await runDuckDBQuery(db, input.options, 1000).catch(() => false);
            const values = result.getChildAt(0);
            if (values) {
              options = Array.from({ length: values.length }, (_, i) => {
                const val = values.get(i);
                return { id: val, label: val };
              });
            }
          } else if (Array.isArray(input.options)) {
            options = input.options.map(option => ({
              id: option,
              label: option,
            }));
          }

          if (input?.default) {
            defaultValue = {
              id: input.default,
              label: input.default,
            };

            if (input?.multi) {
              defaultValue =
                Array.isArray(input.default) && input.default.length > 0
                  ? input.default.map(d => ({ id: d, label: d }))
                  : [];
            }
            setDefaultInputValue(input.name, input.default)
          }


          setComponentData({
            type: DROPDOWN,
            options,
            defaultValue,
            label: input?.label ?? '',
            isMulti: input?.multi ?? false,
            name: input.name
          });
          break;
        }

        default:
          setComponentData(null);
      }

      setLoading(false);
    };

    prepareComponent();
  }, [db, input, setDefaultInputValue]);

  if (loading) {
    return <Loading text={input?.name ?? ''} width={itemWidth} />;
  }

  if (!componentData) return null;

  return (
    <div className={`grow-${itemWidth} p-2 m-auto flex`}>
      <div className="m-auto justify-center">
        {componentData.type === DROPDOWN && (
          <Dropdown
            {...componentData}
            setInputValue={setInputValue}
          />
        )}
      </div>
    </div>
  );
};

export default Input;
