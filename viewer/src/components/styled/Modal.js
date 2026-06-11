import tw from 'tailwind-styled-components';

// z-[70]: modals must stack above everything, including the Workspace route
// overlay (z-[60], which itself sits above Home's z-50 TopNav). Home mounts
// PublishModal/DeployModal once at the layout level; without this they would
// render invisibly UNDER the Workspace overlay.
export const ModalOverlay = tw.div`
  fixed
  inset-0
  flex
  items-center
  justify-center
  z-[70]
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
