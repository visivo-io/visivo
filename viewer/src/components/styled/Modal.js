import tw from "tailwind-styled-components";

export const ModalOverlay = tw.div`
  fixed 
  inset-0 
  flex 
  items-center 
  justify-center 
  z-50 
  bg-opacity-50 
  backdrop-blur-sm
`;

export const ModalWrapper = tw.div`
  bg-white 
  rounded-2xl 
  shadow-2xl 
  p-8 
  w-full 
  max-w-2xl 
  mx-4 
  transform 
  transition-all
`;