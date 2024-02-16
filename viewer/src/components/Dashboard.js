import React, { useState, useEffect } from "react";
import Chart from './items/Chart.js'
import Table from './items/Table.js'
import Markdown from 'react-markdown'
import useDimensions from "react-cool-dimensions";
import Loading from "./Loading.js";
import { throwError } from "../api/utils.js";

const Dashboard = (props) => {
    const { observe, width } = useDimensions({
        onResize: ({ observe }) => {
            observe();
        },
    });

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
    const charts = dashboard.rows.map(r => r.items.map(i => i.chart)).flat(2).filter(n => n)
    const tables = dashboard.rows.map(r => r.items.map(i => i.table)).flat(2).filter(n => n)
    const chartTraceNames = charts.map(c => c.traces.map(t => t.name)).flat()
    const tableTraceNames = tables.map(t => t.trace.name).flat()
    const traceNames = chartTraceNames.concat(tableTraceNames);
    const [traceData, setTraceData] = useState(null)

    useEffect(() => {
        const fetchData = async () => {
            if (traceNames.length === 0) {
                setTraceData({})
                return
            }
            const traces = await props.fetchTraces(props.project.id, traceNames);
            const returnJson = {};
            Promise.all(
                traces.map(async (trace) => {
                    const traceResponse = await fetch(trace.signed_data_file_url);
                    const traceJson = await traceResponse.json();
                    returnJson[trace.name] = traceJson;
                })
            ).then(() => {
                setTraceData(returnJson)
            })
        }
        fetchData();
        // eslint-disable-next-line
    }, []);


    const renderComponent = (item, row, itemIndex, rowIndex) => {
        if (item.chart && traceData) {
            return <Chart
                chart={item.chart}
                traceData={traceData}
                project={props.project}
                height={getHeight(row.height)}
                width={getWidth(row, item)}
                key={`dashboardRow${rowIndex}Item${itemIndex}`} />
        } else if (item.table && traceData) {
            return <Table
                width={item.width}
                height={getHeight(row.height)}
                table={item.table}
                traceData={traceData}
                key={`dashboardRow${rowIndex}Item${itemIndex}`} />
        } else if (item.chart || item.table) {
            return <div
                className={`grow-${item.width} m-auto text-center`}
                key={`dashboardRow${rowIndex}Item${itemIndex}`}><Loading /></div>
        } else if (item.markdown) {
            return <Markdown
                className={`grow-${item.width} p-2 m-auto prose`}
                key={`dashboardRow${rowIndex}Item${itemIndex}`} >
                {item.markdown}
            </Markdown>
        }
        return null
    }
    return (
        <div ref={observe} data-testid={`dashboard_${props.dashboardName}`} className='overflow-auto flex grow flex-col justify-items-stretch'>
            {dashboard.rows.map((row, rowIndex) =>
                <div className="flex" style={{ height: getHeight(row.height) }} key={`dashboardRow${rowIndex}`}>
                    {row.items.map((item, itemIndex) => renderComponent(item, row, itemIndex, rowIndex))}
                </div>
            )}
        </div >
    );
}

export default Dashboard;