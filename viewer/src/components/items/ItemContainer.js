import tw from 'tailwind-styled-components';

// w-full / h-full make the container fill its dashboard slot; without them tables shrink to
// content in narrow slots or overflow with no scrollbar in wide ones.
export const ItemContainer = tw.div`
    relative
    w-full
    h-full
    rounded-2xl
    shadow-lg
    transition
    duration-200
    overflow-hidden
    hover:shadow-lg
    hover:z-40
    hover:border-gray-300
    border
    border-(--vt-border)
    bg-(--vt-surface)
`;
