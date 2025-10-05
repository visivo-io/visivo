
import tw from 'tailwind-styled-components';

export const DropdownButton = tw.button`
  w-full
  bg-white
  border
  border-gray-300
  rounded-lg
  px-4
  py-2
  text-left
  shadow-sm
  hover:border-gray-400
  focus:ring-2
  focus:ring-blue-500
  focus:border-blue-500
  transition-all
  duration-200
  flex
  items-center
  justify-between
  cursor-pointer
`;

export const DropdownMenu = tw.div`
  absolute
  z-50
  w-full
  mt-2
  bg-white
  border
  border-gray-300
  rounded-lg
  shadow-lg
`;

export const SearchInput = tw.input`
  w-full
  px-3
  py-2
  border
  border-gray-300
  rounded-md
  focus:ring-2
  focus:ring-blue-500
  focus:border-blue-500
  text-sm
`;


export const SelectedTag = tw.span`
  inline-flex
  items-center
  bg-blue-100
  text-blue-800
  text-xs
  font-medium
  px-2
  py-1
  rounded-full
`;

export const LoadingContainer = tw.div`
  w-full
  bg-gray-100
  border
  border-gray-300
  rounded-lg
  px-4
  py-2
  animate-pulse
`;

export const LoadingBar = tw.div`
  h-5
  bg-gray-300
  rounded
`;

export const DropdownLabel = tw.h2`
  text-md
  text-center
  font-bold
  mb-2
  text-gray-800
`;