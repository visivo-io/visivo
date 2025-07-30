import React from "react";

const ModalContainer = ({ children }) => {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-2xl mx-4 transform transition-all">
        { children }
      </div>
    </div>
  );
}

export default ModalContainer;