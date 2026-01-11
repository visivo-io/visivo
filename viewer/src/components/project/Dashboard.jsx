import Chart from '../items/Chart';
import Table from '../items/Table';
import Selector from '../items/Selector';
import useDimensions from 'react-cool-dimensions';
import { throwError } from '../../api/utils';
import { useSearchParams } from 'react-router-dom';
import { getSelectorByOptionName } from '../../models/Project';
import Markdown from '../items/Markdown';
import Input from '../items/Input';

const Dashboard = ({ project, dashboardName }) => {
  const [searchParams] = useSearchParams();

  const { observe, width } = useDimensions({
    onResize: ({ observe }) => {
      observe();
    },
  });

  const widthBreakpoint = 1024;
  const isColumn = width < widthBreakpoint;

  const getHeight = height => {
    if (height === 'xsmall') {
      return 128;
    } else if (height === 'small') {
      return 256;
    } else if (height === 'medium') {
      return 396;
    } else if (height === 'large') {
      return 512;
    } else if (height === 'xlarge') {
      return 768;
    } else {
      return 1024;
    }
  };

  const getWidth = (items, item) => {
    if (width < widthBreakpoint) {
      return width;
    }
    const totalWidth = items.reduce((partialSum, i) => {
      const itemWidth = i.width ? i.width : 1;
      return partialSum + itemWidth;
    }, 0);

    const itemWidth = item.width ? item.width : 1;
    return width * (itemWidth / totalWidth);
  };

  const dashboard = project.project_json.dashboards.find(d => d.name === dashboardName);
  if (!dashboard) {
    throwError(`Dashboard with name ${dashboardName} not found.`, 404);
  }

  const shouldShowNamedModel = namedModel => {
    if (!namedModel || !namedModel.name) {
      return true;
    }
    const selector = getSelectorByOptionName(project, namedModel.name);
    if (selector && searchParams.has(selector.name)) {
      const selectedNames = searchParams.get(selector.name).split(',');
      if (!selectedNames.includes(namedModel.name)) {
        return false;
      }
    }
    return true;
  };

  const shouldShowItem = item => {
    if (!shouldShowNamedModel(item)) {
      return false;
    }
    let object;
    if (item.chart) {
      object = item.chart;
    } else if (item.table) {
      object = item.table;
    } else if (item.selector) {
      object = item.selector;
    } else if (item.input) {
      object = item.input;
    }
    return shouldShowNamedModel(object);
  };

  const renderRow = (row, rowIndex) => {
    if (!shouldShowNamedModel(row)) {
      return null;
    }
    const visibleItems = row.items.filter(shouldShowItem);
    const totalWidth = visibleItems.reduce((sum, item) => sum + (item.width || 1), 0);
    const rowStyle = isColumn ? {} : getHeightStyle(row);

    return (
      <div
        key={`row-${rowIndex}`}
        className={`dashboard-row w-full max-w-full ${isColumn ? 'flex' : 'grid justify-center'}`}
        style={{
          margin: '0.5rem',
          display: isColumn ? 'flex' : 'grid',
          flexDirection: isColumn ? 'column' : undefined,
          gridTemplateColumns: isColumn ? undefined : `repeat(${totalWidth}, 1fr)`,
          gap: '0.7rem',
          ...rowStyle,
        }}
      >
        {visibleItems.map((item, itemIndex) => (
          <div
            key={`item-${rowIndex}-${itemIndex}-${item.chart?.path || item.table?.path || item.selector?.path}`}
            className={isColumn ? 'w-full max-w-full' : ''}
            style={{
              gridColumn: isColumn ? undefined : `span ${item.width || 1}`,
              width: isColumn ? '100%' : 'auto',
            }}
          >
            <div className="flex items-center h-full w-full max-w-full">
              {renderComponent(item, row, itemIndex, rowIndex)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderComponent = (item, row, itemIndex, rowIndex) => {
    const items = row.items.filter(shouldShowItem);
    if (items.indexOf(item) < 0) {
      return null;
    }
    if (item.input) {
      return (
        <Input
          input={item.input}
          project={project}
          itemWidth={item.width}
          key={`dashboardRow${rowIndex}Item${itemIndex}`}
        ></Input>
      );
    } else if (item.table) {
      return (
        <Table
          table={item.table}
          project={project}
          itemWidth={item.width}
          width={getWidth(items, item)}
          height={getHeight(row.height)}
          key={`dashboardRow${rowIndex}Item${itemIndex}`}
        />
      );
    } else if (item.selector) {
      return (
        <Selector
          selector={item.selector}
          project={project}
          itemWidth={item.width}
          key={`dashboardRow${rowIndex}Item${itemIndex}`}
        ></Selector>
      );
    } else if (item.chart) {
      return (
        <Chart
          chart={item.chart}
          project={project}
          height={getHeight(row.height) - 8}
          width={getWidth(items, item)}
          itemWidth={item.width}
          key={`dashboardRow${rowIndex}Item${itemIndex}`}
        />
      );
    } else if (item.markdown) {
      return (
        <Markdown
          key={`dashboardRow${rowIndex}Item${itemIndex}`}
          markdown={item.markdown}
          row={row}
          height={getHeight(row.height)}
        />
      );
    }
    return null;
  };

  const getHeightStyle = row => {
    if (row.height !== 'compact') {
      return { height: getHeight(row.height) };
    } else {
      return null;
    }
  };

  return (
    <div
      ref={observe}
      data-testid={`dashboard_${dashboardName}`}
      className="flex grow flex-col justify-items-stretch w-full max-w-full overflow-x-hidden px-4"
    >
      {dashboard.rows.map(renderRow)}
    </div>
  );
};

export default Dashboard;
