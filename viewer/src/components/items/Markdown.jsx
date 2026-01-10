import React, { useState } from 'react';
import MarkdownRenderer from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { itemNameToSlug } from './utils';
import MenuContainer from './MenuContainer';
import Menu from './Menu';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShareAlt } from '@fortawesome/free-solid-svg-icons';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';

const Markdown = ({ markdown, row, height }) => {
  const [hovering, setHovering] = useState(false);
  const { toolTip, copyText, resetToolTip } = useCopyToClipboard();

  const alignmentClass =
    markdown.align === 'right'
      ? 'text-right'
      : markdown.align === 'center'
        ? 'text-center'
        : 'text-left';

  // Get the path from the markdown object (could be on markdown itself or on name)
  const markdownPath = markdown.path || markdown.name || '';

  return (
    <div
      id={itemNameToSlug(markdownPath)}
      data-testid={itemNameToSlug(markdownPath)}
      className={`relative w-full h-full flex flex-col ${alignmentClass}`}
      style={row.height !== 'compact' ? { height: height } : {}}
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
              const url = new URL(window.location.href);
              url.searchParams.set('element_id', window.scrollY);
              copyText(url.toString());
            },
            onMouseLeave: resetToolTip,
          }}
          showToolTip
          toolTip={toolTip}
        ></Menu>
      </MenuContainer>
      <div
        className={`w-full h-full overflow-auto flex flex-col items-stretch ${markdown.justify}`}
      >
        <MarkdownRenderer
          className={`p-2 prose max-w-none ${
            markdown.justify === 'end'
              ? 'mt-auto'
              : markdown.justify === 'center'
                ? 'my-auto'
                : markdown.justify === 'between'
                  ? 'grow flex flex-col justify-between'
                  : markdown.justify === 'around'
                    ? 'grow flex flex-col justify-around'
                    : markdown.justify === 'evenly'
                      ? 'grow flex flex-col justify-evenly'
                      : ''
          }`}
          key={markdownPath}
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw, rehypeSanitize]}
        >
          {markdown.content}
        </MarkdownRenderer>
      </div>
    </div>
  );
};

export default Markdown;
