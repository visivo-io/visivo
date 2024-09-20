import React from "react";
import Chart from './items/Chart.js'
import Table from './items/Table.js'
import Selector from './items/Selector.js'
import Markdown from 'react-markdown'
import useDimensions from "react-cool-dimensions";
import { throwError } from "../api/utils.js";
import { useSearchParams } from "react-router-dom";
import { getSelectorByOptionName } from "../models/Project.js";

const Dashboard = ({ project, dashboardName }) => {
    const [searchParams] = useSearchParams();
    const { observe, width } = useDimensions({
        onResize: ({ observe }) => {
            observe();
        },
    });

    const widthBreakpoint = 1024;
    const isColumn = width < widthBreakpoint;

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

    const getWidth = (items, item) => {
        if (width < widthBreakpoint) {
            return width;
        }
        const totalWidth = items.reduce((partialSum, i) => {
            const itemWidth = i.width ? i.width : 1
            return partialSum + itemWidth;
        }, 0);

        const itemWidth = item.width ? item.width : 1;
        return width * (itemWidth / totalWidth)
    }

    const dashboard = project.project_json.dashboards.find(d => d.name === dashboardName)
    if (!dashboard) {
        throwError(`Dashboard with name ${dashboardName} not found.`, 404);
    }

    const shouldShowNamedModel = (namedModel) => {
        const selector = getSelectorByOptionName(project, namedModel.name)
        if (selector && searchParams.has(selector.name)) {
            const selectedNames = searchParams.get(selector.name).split(",")
            if (!selectedNames.includes(namedModel.name)) {
                return false
            }
        }
        return true
    }

    const renderRow = (row, rowIndex) => {
        if (!shouldShowNamedModel(row)) {
            return null;
        }
        const visibleItems = row.items.filter(item => shouldShowNamedModel(item));
        const totalWidth = visibleItems.reduce((sum, item) => sum + (item.width || 1), 0);
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
                {visibleItems.map((item, itemIndex) => (
                    <div
                        key={`item-${rowIndex}-${itemIndex}`}
                        style={{
                            gridColumn: isColumn ? undefined : `span ${item.width || 1}`,
                            width: isColumn ? '100%' : 'auto'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                            {renderComponent(item, row, itemIndex, rowIndex)}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderComponent = (item, row, itemIndex, rowIndex) => {
        const items = row.items.filter(item => shouldShowNamedModel(item))
        if (items.indexOf(item) < 0) {
            return null
        }
        if (item.chart) {
            return <Chart
                chart={item.chart}
                project={project}
                height={getHeight(row.height) - 8}
                width={getWidth(items, item)}
                itemWidth={item.width}
                key={`dashboardRow${rowIndex}Item${itemIndex}`} />
        } else if (item.table) {
            return <Table
                table={item.table}
                project={project}
                itemWidth={item.width}
                width={getWidth(items, item)}
                height={getHeight(row.height)}
                key={`dashboardRow${rowIndex}Item${itemIndex}`} />
        } else if (item.selector) {
            return <Selector
                selector={item.selector}
                project={project}
                itemWidth={item.width}
                key={`dashboardRow${rowIndex}Item${itemIndex}`} >
            </Selector>
        } else if (item.markdown) {
            return <Markdown
                className={`grow-${item.width} p-2 m-auto prose`}
                key={`dashboardRow${rowIndex}Item${itemIndex}`} >
                {item.markdown}
            </Markdown>
        }
        return null
    }

    const getHeightStyle = (row) => {
        if (row.height !== "compact") {
            return { height: getHeight(row.height) }
        } else {
            return null
        }
    }

    return (
        <div ref={observe} data-testid={`dashboard_${dashboardName}`} className='flex grow flex-col justify-items-stretch'>
            {dashboard.rows.map(renderRow)}
        </div >
    );
}

export default Dashboard;