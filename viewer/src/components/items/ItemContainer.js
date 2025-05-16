import tw from 'tailwind-styled-components';

export const ItemContainer = tw.div`
    relative
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
