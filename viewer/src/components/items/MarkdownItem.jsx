import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

/**
 * MarkdownItem component for rendering markdown content in dashboards
 */
const MarkdownItem = ({
  markdown,
  align = 'left',
  justify = 'start',
  height = 396,
  className = '',
  style = {},
}) => {
  const alignmentClass =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  const containerStyle = {
    ...style,
    ...(height !== 'compact' ? { height } : {}),
  };

  return (
    <div
      className={`w-full h-full flex flex-col ${alignmentClass} ${className}`}
      style={containerStyle}
    >
      <div className={`w-full h-full overflow-auto flex flex-col items-stretch ${justify}`}>
        <Markdown
          className={`p-2 prose max-w-none ${
            justify === 'end'
              ? 'mt-auto'
              : justify === 'center'
                ? 'my-auto'
                : justify === 'between'
                  ? 'grow flex flex-col justify-between'
                  : justify === 'around'
                    ? 'grow flex flex-col justify-around'
                    : justify === 'evenly'
                      ? 'grow flex flex-col justify-evenly'
                      : ''
          }`}
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw, rehypeSanitize]}
        >
          {markdown}
        </Markdown>
      </div>
    </div>
  );
};

export default MarkdownItem;
