import React, { useMemo } from "react";
import Chart from './items/Chart.js'
import Table from './items/Table.js'
import Selector from './items/Selector.js'
import Markdown from 'react-markdown'
import useDimensions from "react-cool-dimensions";
import { throwError } from "../api/utils.js";
import { useSearchParams } from "react-router-dom";
import { getSelectorByOptionName } from "../models/Project.js";
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

const Dashboard = ({ project, dashboardName }) => {
    const [searchParams] = useSearchParams();
    const { observe, width } = useDimensions({
        onResize: ({ observe }) => {
            observe();
        },
    });

    const widthBreakpoint = 1024;
    const isColumn = width < widthBreakpoint;

    const dashboard = project.project_json.dashboards.find(d => d.name === dashboardName);
    if (!dashboard) {
        throwError(`Dashboard with name ${dashboardName} not found.`, 404);
    }

    const shouldShowNamedModel = useMemo(() => (namedModel) => {
        if (!namedModel || !namedModel.name) {
            return true
        }
        const selector = getSelectorByOptionName(project, namedModel.name)
        if (selector && searchParams.has(selector.name)) {
            const selectedNames = searchParams.get(selector.name).split(",")
            if (!selectedNames.includes(namedModel.name)) {
                return false
            }
        }
        return true
    }, [project, searchParams]);

    const shouldShowItem = useMemo(() => (item) => {
        if (!shouldShowNamedModel(item)) {
            return false
        }
        let object;
        if (item.chart) {
            object = item.chart
        } else if (item.table) {
            object = item.table
        } else if (item.selector) {
            object = item.selector
        }
        return shouldShowNamedModel(object)
    }, [shouldShowNamedModel]);

    // Organize items in loading order (top-to-bottom, left-to-right)
    const orderedItems = useMemo(() => {
        if (!dashboard) return [];
        
        return dashboard.rows.flatMap((row, rowIndex) => 
            row.items
                .filter(shouldShowItem)
                .map((item, colIndex) => ({
                    item,
                    row,
                    rowIndex,
                    colIndex,
                    priority: rowIndex * 1000 + colIndex // Priority based on position
                }))
        ).sort((a, b) => a.priority - b.priority);
    }, [dashboard, shouldShowItem]); // shouldShowItem includes all necessary dependencies

    // Group ordered items by row for rendering
    const rowsWithPriority = useMemo(() => {
        const rowMap = new Map();
        orderedItems.forEach(({ item, row, rowIndex, colIndex, priority }) => {
            if (!rowMap.has(rowIndex)) {
                rowMap.set(rowIndex, {
                    row,
                    items: []
                });
            }
            rowMap.get(rowIndex).items.push({ item, colIndex, priority });
        });
        return Array.from(rowMap.entries())
            .sort(([a], [b]) => a - b)
            .map(([_, rowData]) => rowData);
    }, [orderedItems]);

    const getHeight = (height) => {
        if (height === 'xsmall') {
            return 128
        } else if (height === 'small') {
            return 256
        } else if (height === 'medium') {
            return 396
        } else if (height === 'large') {
            return 512
        } else if (height === 'xlarge') {
            return 768
        } else {
            return 1024
        }
    }

    const getWidth = (items, currentItem) => {
        if (width < widthBreakpoint) {
            return width;
        }
        const totalWidth = items.reduce((partialSum, { item }) => {
            const itemWidth = item.width ? item.width : 1;
            return partialSum + itemWidth;
        }, 0);

        const itemWidth = currentItem.width ? currentItem.width : 1;
        return width * (itemWidth / totalWidth);
    }

    const renderComponent = (itemData, row, items, itemIndex, rowIndex) => {
        const { item, priority } = itemData;
        if (item.chart) {
            return <Chart
                chart={item.chart}
                project={project}
                height={getHeight(row.height) - 8}
                width={getWidth(items, item)}
                itemWidth={item.width}
                priority={priority}
                key={`dashboardRow${rowIndex}Item${itemIndex}`} />
        } else if (item.table) {
            return <Table
                table={item.table}
                project={project}
                itemWidth={item.width}
                width={getWidth(items, item)}
                height={getHeight(row.height)}
                priority={priority}
                key={`dashboardRow${rowIndex}Item${itemIndex}`} />
        } else if (item.selector) {
            return <Selector
                    selector={item.selector}
                    project={project}
                    itemWidth={item.width}
                    priority={priority}
                    key={`dashboardRow${rowIndex}Item${itemIndex}`} >
                </Selector>
        } else if (item.markdown) {
            const alignmentClass = item.align === 'right' ? 'text-right' : 
                                  item.align === 'center' ? 'text-center' : 
                                  'text-left';
            
            return (
                <div className={`w-full h-full flex flex-col ${alignmentClass}`} 
                     style={row.height !== 'compact' ? { height: getHeight(row.height) } : {}}>
                    <div className={`w-full h-full overflow-auto flex flex-col items-stretch ${item.justify}`}>
                        <Markdown
                            className={`p-2 prose max-w-none ${item.justify === 'end' ? 'mt-auto' : 
                                       item.justify === 'center' ? 'my-auto' : 
                                       item.justify === 'between' ? 'flex-grow flex flex-col justify-between' :
                                       item.justify === 'around' ? 'flex-grow flex flex-col justify-around' :
                                       item.justify === 'evenly' ? 'flex-grow flex flex-col justify-evenly' : ''}`}
                            key={`dashboardRow${rowIndex}Item${itemIndex}`}
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeRaw, rehypeSanitize]}
                        >
                            {item.markdown}
                        </Markdown>
                    </div>
                </div>
            );
        }
        return null
    }

    const renderRow = ({ row, items }, rowIndex) => {
        const totalWidth = items.reduce((sum, { item }) => sum + (item.width || 1), 0);
        const rowStyle = isColumn ? {} : getHeightStyle(row)

        return (
            <div
                key={`row-${rowIndex}`}
                className="dashboard-row"
                style={{
                    margin: '0.1rem',
                    display: isColumn ? 'flex' : 'grid',
                    flexDirection: isColumn ? 'column' : undefined,
                    gridTemplateColumns: isColumn ? undefined : `repeat(${totalWidth}, 1fr)`,
                    gap: '0.1rem',
                    ...rowStyle
                }}
            >
                {items.map((itemData, itemIndex) => (
                    <div
                        key={`item-${rowIndex}-${itemIndex}-${itemData.item.chart?.path || itemData.item.table?.path || itemData.item.selector?.path}`}
                        style={{
                            gridColumn: isColumn ? undefined : `span ${itemData.item.width || 1}`,
                            width: isColumn ? '100%' : 'auto'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                            {renderComponent(itemData, row, items, itemIndex, rowIndex)}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const getHeightStyle = (row) => {
        if (row.height !== "compact") {
            return { height: getHeight(row.height) }
        } else {
            return null
        }
    }

    return (
        <div ref={observe} data-testid={`dashboard_${dashboardName}`} className='flex grow flex-col justify-items-stretch'>
            {rowsWithPriority.map(renderRow)}
        </div>
    );
}

export default Dashboard;
