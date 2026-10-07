import tw from 'tailwind-styled-components';

// w-full / h-full make the container fill its dashboard slot; without them tables shrink to
// content in narrow slots or overflow with no scrollbar in wide ones.
//
// The border carries the card edge, so the resting state has no shadow: shadow-lg put a
// 10px-offset smear under every item, which on a light page reads as a dark band along the
// bottom rather than as depth. Hover raises a real one, which is also what the old styling
// MEANT to do — its hover class was the same shadow-lg as the resting state, so hovering
// changed nothing.
export const ItemContainer = tw.div`
    relative
    w-full
    h-full
    rounded-lg
    transition
    duration-200
    overflow-hidden
    hover:shadow-md
    hover:z-40
    hover:border-gray-300
    border
    border-(--vt-border)
    bg-(--vt-surface)
`;
