import { MaterialReactTable } from 'material-react-table';
import { cleanedTableData } from '../../models/Trace'
import { createTheme, ThemeProvider } from '@mui/material';

const Table = (props) => {
    const tableTheme = createTheme({
        palette: {
            primary: { main: 'rgb(210, 89, 70)' },
            info: { main: 'rgb(79, 73, 76)' }
        }
    });

    const tableData = cleanedTableData(props.traceData, props.table)
    const columns = props.table.columns.map((column) => {
        return { accessorKey: column.column, ...column }
    })

    return (
        <ThemeProvider theme={tableTheme}>
            <MaterialReactTable
                columns={columns}
                data={tableData}
                muiTablePaperProps={{
                    sx: {
                        flexGrow: props.width,
                    },
                }}
                {...props.table.props}
                enableRowSelection
                enableColumnOrdering
                enableGlobalFilter={false}
            />
        </ThemeProvider>
    );
}

export default Table;