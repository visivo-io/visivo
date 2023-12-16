
import tw from "tailwind-styled-components"

export const Sidebar = tw.aside`
   z-40
   w-64
   h-screen
   px-3
   py-4
   overflow-y-auto
   rounded-lg
   mr-2
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