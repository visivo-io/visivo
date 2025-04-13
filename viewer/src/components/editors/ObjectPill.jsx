import React from 'react';
import useStore from '../../stores/store';
import Pill from '../styled/Pill';

const ObjectPill = ({name, inline = false}) => {
  const openTab = useStore((state) => state.openTab);
  const type = useStore((state) => state.namedChildren[name]?.type);
  

  const handleObjectOpen = () => {
    openTab(name, type);
  };

  return (
    <Pill name={name} type={type} onDoubleClick={handleObjectOpen}/>
  );
};

export default ObjectPill;