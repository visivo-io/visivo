import Loading from "../Loading";
import Menu from "./Menu"
import MenuItem from "../styled/MenuItem";
import React, { useEffect, useState } from "react";
import { tableDataFromCohortData, tableColumns, tableColumnsWithDot, tableColumnsWithUnderscores } from '../../models/Table'
import { createTheme, ThemeProvider, useThemeProps } from '@mui/material';
import { useTracesData } from "../../hooks/useTracesData";
import tw from "tailwind-styled-components"
import CohortSelect from "./CohortSelect";
import {
    MRT_GlobalFilterTextField,
    MRT_ShowHideColumnsButton,
    MRT_TablePagination,
    MRT_ToggleDensePaddingButton,
    MRT_ToggleFiltersButton,
    MRT_ToolbarAlertBanner,
    useMaterialReactTable,
    MRT_TableContainer,
} from 'material-react-table';
import { IconButton, Box, Button, Typography, Tooltip } from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';

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
            setColumns(tableColumnsWithDot(table, selectedTableCohort))
        }
    }, [selectedTableCohort, tracesData, table]);

    useEffect(() => {
        if (selectedTableCohort && columns) {
            setTableData(tableDataFromCohortData(selectedTableCohort, columns))
        }
    }, [selectedTableCohort, columns]);

    const useTable = useMaterialReactTable({
        columns: tableColumnsWithUnderscores(columns),
        data: tableData,
        enableRowSelection: true,
        initialState: { showGlobalFilter: true },
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
        setSelectedTableCohort(changedSelectedTracesData[traceName][cohortName])
    }

    return (
        <ThemeProvider theme={tableTheme}>
            <Box sx={{ width: width, height: height }}>
                <Box
                    sx={(theme) => ({
                        display: 'flex',
                        backgroundColor: 'inherit',
                        borderRadius: '4px',
                        flexDirection: 'row',
                        gap: '16px',
                        justifyContent: 'space-between',
                        padding: '24px 16px',
                        '@media max-width: 768px': {
                            flexDirection: 'column',
                        },
                    })}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CohortSelect tracesData={tracesData} onChange={onSelectedCohortChange} isMulti={false} />
                        <MRT_ToggleFiltersButton table={useTable} />
                        <MRT_ShowHideColumnsButton table={useTable} />
                        <MRT_ToggleDensePaddingButton table={useTable} />
                        <Tooltip title="Print">
                            <IconButton onClick={() => window.print()}>
                                <PrintIcon />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>
                <MRT_TableContainer table={useTable} />
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