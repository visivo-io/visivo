import Item, { getItemHeight, getItemWidth } from '../items/Item';
import useDimensions from 'react-cool-dimensions';
import { throwError } from '../../api/utils';
import { useSearchParams } from 'react-router-dom';
import { getSelectorByOptionName } from '../../models/Project';

const Dashboard = ({ project, dashboardName }) => {
  const [searchParams] = useSearchParams();

  const { observe, width } = useDimensions({
    onResize: ({ observe }) => {
      observe();
    },
  });

  const widthBreakpoint = 1024;
  const isColumn = width < widthBreakpoint;

  const getHeight = height => getItemHeight(height);

  const getWidth = (items, item) => getItemWidth(width, widthBreakpoint, items, item);

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

    return (
      <Item
        item={item}
        project={project}
        height={getHeight(row.height)}
        width={getWidth(items, item)}
        itemWidth={item.width}
        rowIndex={rowIndex}
        itemIndex={itemIndex}
        keyPrefix="dashboard"
        row={row}
      />
    );
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
