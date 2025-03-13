import React from 'react';
import useStore from '../../stores/store';
import { TYPE_STYLE_MAP } from '../styled/VisivoObjectStyles';
import { HiOutlineDatabase } from "react-icons/hi";

const ObjectPill = ({name}) => {
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
      onDoubleClick={handleObjectOpen}
    >
      <Icon className={`w-5 h-5 mr-2 ${typeConfig.text}`} />
      <span className={`text-sm font-medium ${typeConfig.text} truncate`}>
        {name}
      </span>
    </div>
  );
};

export default ObjectPill;