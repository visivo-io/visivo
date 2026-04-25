import tw from 'tailwind-styled-components';

// w-full / h-full ensure the container fills its parent dashboard item div
// rather than sizing to the natural width of inner content. Without these,
// 2.0 tables shrink to content (leaving empty gutters in narrow slots) or
// overflow horizontally with no scrollbar in wide slots. See B15 in
// specs/plan/v1-final-bugfixes/.
export const ItemContainer = tw.div`
    relative
    w-full
    h-full
    rounded-2xl
    shadow-lg           // Adds a subtle shadow for the "pop out" effect
    transition          // Enables smooth transition
    duration-200        // Sets the duration of the transition
    overflow-hidden
    hover:shadow-lg     // Increases shadow on hover for the "pop out" effect
    hover:z-40
    hover:border-gray-300
    border
    border-gray-150
`;
