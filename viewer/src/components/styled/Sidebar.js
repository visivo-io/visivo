import tw from 'tailwind-styled-components';

export const Sidebar = tw.div`
   w-64 bg-white border-r border-gray-200 p-4 h-full flex flex-col
`;

export const SidebarList = tw.aside`
   space-y-2
   font-medium
`;

export const SidebarItem = tw.aside`
   flex
   items-center
   p-2
   text-gray-900
   rounded-lg
   hover:bg-gray-100
   group
`;
