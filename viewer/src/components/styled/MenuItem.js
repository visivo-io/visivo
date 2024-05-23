import tw from "tailwind-styled-components"

const Link = tw.span`
    block 
    px-4 
    py-2 
    hover:bg-gray-100 
    dark:hover:bg-gray-600 
    dark:hover:text-white
`;


const MenuItem = ({ children, onClick }) => {
    return (
        <li>
            <Link onClick={onClick}>{children}</Link>
        </li>
    )
}

export default MenuItem

