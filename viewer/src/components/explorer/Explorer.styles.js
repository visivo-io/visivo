import tw from 'tailwind-styled-components';

export const Container = tw.div`
  flex
  h-[calc(100vh-50px)]
  bg-gray-50
  flex-col
  overflow-hidden
  m-0
  inset-0
`;

export const MainContent = tw.div`
  flex
  flex-1
  min-h-0
  relative
`;

export const RightPanel = tw.div`
  flex-1
  min-h-0
  flex
  flex-col
`;

export const Info = tw.div`
  absolute
  z-10
  bottom-10
  right-10
  flex
  flex-1
  bg-highlight
  text-white
  rounded-md
  p-2
  shadow-md
  overflow-hidden
`;
