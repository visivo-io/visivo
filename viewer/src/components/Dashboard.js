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

    const getWidth = (row, item) => {
        if (width < widthBreakpoint) {
            return width;
        }
        const totalWidth = row.items.reduce((partialSum, i) => {
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

    const renderComponent = (item, row, itemIndex, rowIndex) => {
        if (item.chart) {
            return <Chart
                chart={item.chart}
                project={project}
                height={getHeight(row.height)}
                width={getWidth(row, item)}
                itemWidth={item.width}
                key={`dashboardRow${rowIndex}Item${itemIndex}`} />
        } else if (item.table) {
            return <Table
                table={item.table}
                project={project}
                itemWidth={item.width}
                width={getWidth(row, item)}
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

    const renderRow = (row, rowIndex) => {
        const selector = getSelectorByOptionName(project, row.name)
        if (selector && searchParams.has(selector.name)) {
            const selectedNames = searchParams.get(selector.name).split(",")
            if (!selectedNames.includes(row.name)) {
                return null
            }
        }
        return (
            <div className={`flex ${isColumn ? 'flex-col space-y-2' : 'flex-row space-x-2'} my-1`}
                style={isColumn ? {} : getHeightStyle(row)}
                key={`dashboardRow${rowIndex}`}
            >
                {row.items.map((item, itemIndex) => renderComponent(item, row, itemIndex, rowIndex))}
            </div>
        )
    }
    return (
        <div ref={observe} data-testid={`dashboard_${dashboardName}`} className='flex grow flex-col justify-items-stretch'>
            {dashboard.rows.map(renderRow)}
        </div >
    );
}

export default Dashboard;