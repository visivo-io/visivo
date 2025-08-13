import React, { useState } from 'react';
import { ItemContainer } from './ItemContainer';
import MenuContainer from './MenuContainer';
import Menu from './Menu';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShareAlt } from '@fortawesome/free-solid-svg-icons';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';

const Iframe = ({ url, height }) => {
  const [hovering, setHovering] = useState(false);
  const { toolTip, copyText, resetToolTip } = useCopyToClipboard();

  return (
    <ItemContainer
      onMouseOver={() => setHovering(true)}
      onMouseOut={() => setHovering(false)}
    >
      <MenuContainer>
        <Menu
          hovering={hovering}
          withDropDown={false}
          buttonChildren={<FontAwesomeIcon icon={faShareAlt} />}
          buttonProps={{
            style: {
              cursor: 'pointer',
              visibility: hovering ? 'visible' : 'hidden',
            },
            onClick: () => {
              const shareUrl = new URL(window.location.href);
              shareUrl.searchParams.set('element_id', window.scrollY);
              copyText(shareUrl.toString());
            },
            onMouseLeave: resetToolTip,
          }}
          showToolTip
          toolTip={toolTip}
        ></Menu>
      </MenuContainer>
      <iframe
        src={url}
        title={url}
        width="100%"
        height={height}
        frameBorder="0"
        className="w-full"
      ></iframe>
    </ItemContainer>
  );
};

export default Iframe;
