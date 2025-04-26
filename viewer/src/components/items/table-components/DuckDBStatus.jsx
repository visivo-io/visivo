const DuckDBStatus = ({ duckDBStatus, db }) => {
  return (
    <div className="flex items-center gap-2 p-2.5 bg-white rounded border border-gray-200">
      {duckDBStatus.state === "loading" && (
        <>
          <div className="animate-spin h-4 w-4 border-2 border-red-200 rounded-full border-t-transparent" />
          <span className="text-sm text-red-700">Loading DuckDB...</span>
        </>
      )}
      {duckDBStatus.state !== "loading" && db && (
        <span className="text-sm text-green-500">DuckDB Loaded</span>
      )}
      {duckDBStatus.state === "idle" && !db && (
        <span className="text-sm text-gray-600">DuckDB Not Loaded</span>
      )}
    </div>
  );
};

export default DuckDBStatus;
