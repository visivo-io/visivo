import { Link } from "react-router-dom";

const BreadcrumbLink = (props) => {
    return (
        <Link className="text-gray-600 hover:text-gray-800" {...props}>
            {props.children}
        </Link>
    );
}

export default BreadcrumbLink;