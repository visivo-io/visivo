import React from "react";
import Chart from './items/Chart.js'
import Table from './items/Table.js'
import Markdown from 'react-markdown'
import useDimensions from "react-cool-dimensions";
import { throwError } from "../api/utils.js";

const Dashboard = (props) => {
    const { observe, width } = useDimensions({
        onResize: ({ observe }) => {
            observe();
        },
    });

    const widthBreakpoint = 1024;
    const isColumn = width < widthBreakpoint;

    const getHeight = (height) => {
        if (height === 'small') {
            return 256
        } else if (height === 'medium') {
            return 396
        } else {
            return 512
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

    const dashboard = props.project.project_json.dashboards.find(d => d.name === props.dashboardName)
    if (!dashboard) {
        throwError(`Dashboard with name ${props.dashboardName} not found.`, 404);
    }

    const renderComponent = (item, row, itemIndex, rowIndex) => {
        if (item.chart) {
            return <Chart
                chart={item.chart}
                project={props.project}
                height={getHeight(row.height)}
                width={getWidth(row, item)}
                itemWidth={item.width}
                key={`dashboardRow${rowIndex}Item${itemIndex}`} />
        } else if (item.table) {
            return <Table
                itemWidth={item.width}
                height={getHeight(row.height)}
                table={item.table}
                key={`dashboardRow${rowIndex}Item${itemIndex}`} />
        } else if (item.markdown) {
            return <Markdown
                className={`grow-${item.width} p-2 m-auto prose`}
                key={`dashboardRow${rowIndex}Item${itemIndex}`} >
                {item.markdown}
            </Markdown>
        }
        return null
    }

    const renderRow = (row, rowIndex) => {
        return (
            <div className={`flex ${isColumn ? 'flex-col' : 'flex-row'}`} style={isColumn ? {} : { height: getHeight(row.height) }} key={`dashboardRow${rowIndex}`}>
                {row.items.map((item, itemIndex) => renderComponent(item, row, itemIndex, rowIndex))}
            </div>
        )
    }
    return (
        <div ref={observe} data-testid={`dashboard_${props.dashboardName}`} className='flex grow flex-col justify-items-stretch'>
            {dashboard.rows.map(renderRow)}
        </div >
    );
}

export default Dashboard;