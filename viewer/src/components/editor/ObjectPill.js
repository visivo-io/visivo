import React from 'react';
import { HiOutlineChartBar, HiOutlineDatabase, HiOutlineViewGrid, HiOutlineSelector, HiOutlineTable } from 'react-icons/hi';
import { MdScatterPlot } from 'react-icons/md';
import { FaExternalLinkAlt } from "react-icons/fa";

export const TYPE_COLORS = {
  'Chart': {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-200',
    icon: HiOutlineChartBar
  },
  'CsvScriptModel': {
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-200',
    icon: HiOutlineDatabase
  },
  'Dashboard': {
    bg: 'bg-purple-100',
    text: 'text-purple-800',
    border: 'border-purple-200',
    icon: HiOutlineViewGrid
  },
  'Selector': {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    border: 'border-yellow-200',
    icon: HiOutlineSelector
  },
  'Table': {
    bg: 'bg-pink-100',
    text: 'text-pink-800',
    border: 'border-pink-200',
    icon: HiOutlineTable
  },
  'Trace': {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    border: 'border-orange-200',
    icon: MdScatterPlot
  },
  'ExternalDashboard': {
    bg: 'bg-black-100',
    text: 'text-black-800',
    border: 'border-black-200',
    icon: FaExternalLinkAlt
  }
};

const ObjectPill = ({ object, onObjectOpen }) => {
  const { name, type } = object;
  const typeConfig = TYPE_COLORS[type] || {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-200',
    icon: HiOutlineDatabase
  };
  const Icon = typeConfig.icon;

  return (
    <div
      className={`flex items-center p-2 mb-2 rounded-lg border ${typeConfig.bg} ${typeConfig.border} cursor-pointer hover:opacity-80 transition-opacity`}
      onDoubleClick={() => onObjectOpen(object)}
    >
      <Icon className={`w-5 h-5 mr-2 ${typeConfig.text}`} />
      <span className={`text-sm font-medium ${typeConfig.text} truncate`}>
        {name}
      </span>
    </div>
  );
};

export default ObjectPill;