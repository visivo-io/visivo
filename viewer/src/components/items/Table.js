/* eslint-disable react/jsx-pascal-case */
import Loading from "../Loading";
import React, { useEffect, useState } from "react";
import { tableDataFromCohortData, tableColumnsWithDot, tableColumnsWithUnderscores } from '../../models/Table'
import { createTheme, ThemeProvider } from '@mui/material';
import { useTracesData } from "../../hooks/useTracesData";
import tw from "tailwind-styled-components"
import CohortSelect from "./CohortSelect";
import {
    MRT_ShowHideColumnsButton,
    MRT_TablePagination,
    MRT_ToggleDensePaddingButton,
    MRT_ToggleFiltersButton,
    MRT_ToolbarAlertBanner,
    useMaterialReactTable,
    MRT_TableContainer,
} from 'material-react-table';
import { Box } from '@mui/material';

export const TableContainer = tw.div`
    relative
`;

const Table = ({ table, project, itemWidth, height, width }) => {
    const traceNames = table.traces.map((trace) => trace.name)
    const tracesData = useTracesData(project.id, traceNames)
    const [selectedTableCohort, setSelectedTableCohort] = useState(null)
    const [columns, setColumns] = useState([])
    const [tableData, setTableData] = useState([])

    useEffect(() => {
        if (selectedTableCohort && tracesData) {
            setColumns(tableColumnsWithDot(table, selectedTableCohort.data, selectedTableCohort.traceName))
        }
    }, [selectedTableCohort, tracesData, table]);

    useEffect(() => {
        if (selectedTableCohort && columns) {
            setTableData(tableDataFromCohortData(selectedTableCohort.data, columns))
        }
    }, [selectedTableCohort, columns]);

    const useTable = useMaterialReactTable({
        columns: tableColumnsWithUnderscores(columns),
        data: tableData,
        enableRowSelection: true,
        initialState: { showGlobalFilter: true, density: "compact" },
    });

    if (!tracesData) {
        return <Loading text={table.name} width={itemWidth} />
    }

    const tableTheme = createTheme({
        palette: {
            primary: { main: 'rgb(210, 89, 70)' },
            info: { main: 'rgb(79, 73, 76)' }
        }
    });

    const onSelectedCohortChange = (changedSelectedTracesData) => {
        const traceName = Object.keys(changedSelectedTracesData)[0]
        const cohortName = Object.keys(changedSelectedTracesData[traceName])[0]
        setSelectedTableCohort({ traceName, data: changedSelectedTracesData[traceName][cohortName] })
    }

    return (
        <ThemeProvider theme={tableTheme}>
            <Box >
                <Box
                    sx={(theme) => ({
                        display: 'flex',
                        backgroundColor: 'inherit',
                        borderRadius: '4px',
                        flexDirection: 'column',
                        gap: '6px',
                        padding: '11px 11px',
                        alignItems: 'flex-end',
                        '@media max-width: 768px': {
                            flexDirection: 'column',
                        },
                    })}
                >
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
                        <MRT_ToggleFiltersButton table={useTable} />
                        <MRT_ShowHideColumnsButton table={useTable} />
                        <MRT_ToggleDensePaddingButton table={useTable} />
                        <CohortSelect
                            tracesData={tracesData}
                            onChange={onSelectedCohortChange}
                            selector={table.selector}
                            parentName={table.name}
                            parentType="table"
                        />
                    </Box>
                </Box>
                <MRT_TableContainer table={useTable} sx={{ width: width, maxHeight: `${height - 120}px` }} />
                <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <MRT_TablePagination table={useTable} />
                    </Box>
                    <Box sx={{ display: 'grid', width: '100%' }}>
                        <MRT_ToolbarAlertBanner stackAlertBanner table={useTable} />
                    </Box>
                </Box>
            </Box>
        </ThemeProvider>
    );
}

export default Table;