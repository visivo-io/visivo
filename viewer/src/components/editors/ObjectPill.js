import React from 'react';
import useStore from '../../stores/store';
import { TYPE_STYLE_MAP } from '../styled/VisivoObjectStyles';
import { HiOutlineDatabase } from "react-icons/hi";
import { PiArrowsInLineHorizontal } from "react-icons/pi";

const ObjectPill = ({name, inline = false}) => {
  const openTab = useStore((state) => state.openTab);
  const type = useStore((state) => state.namedChildren[name]?.type);
  
  const typeConfig = TYPE_STYLE_MAP[type] || {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-200',
    icon: HiOutlineDatabase
  };
  const Icon = typeConfig.icon;

  const handleObjectOpen = () => {
    openTab(name, type);
  };

  return (
    <div
      className={`flex items-center p-2 shadow-md rounded-2xl border ${typeConfig.bg} ${typeConfig.border} cursor-pointer hover:opacity-80 hover:shadow-lg transition-opacity`}
      style={{ minWidth: '30px', maxWidth: '400px', flex: '1 1 auto' }}
      onDoubleClick={handleObjectOpen}
    >
      <div className="group relative">
        <Icon className={`w-5 h-5 mr-2 ${typeConfig.text}`} />
        <div className="absolute z-10 invisible group-hover:visible bg-gray-900 text-white text-xs rounded py-1 px-2 -left-1 -bottom-8 whitespace-nowrap">
          {type || 'Unknown Type'}
        </div>
      </div>
      <span className={`text-sm font-medium ${typeConfig.text} truncate`}>
        {name}
      </span>
      {inline && (
        <div className="group relative ml-auto">
          <PiArrowsInLineHorizontal className={`w-4 h-4 ${typeConfig.text}`} />
          <div className="absolute z-10 invisible group-hover:visible bg-gray-900 text-white text-xs rounded py-1 px-2 right-0 -bottom-8 whitespace-nowrap">
            This object is defined inline <br /> with another object in the project
          </div>
        </div>
      )}
    </div>
  );
};

export default ObjectPill;