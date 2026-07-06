const Error = ({ children }) => {
  return (
    <div className="fixed top-1 left-1 right-1 z-50 flex justify-center items-center p-4 bg-highlight-100 rounded-lg shadow-md">
      <p className="text-highlight-600 font-semibold text-center">{children}</p>
    </div>
  );
};

export default Error;
