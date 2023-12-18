import { json } from "react-router-dom";

export const throwError = (message, status) => {
    throw json(
        { message: message },
        { status: status }
    );
}

export const getAppBaseUrl = () => {
    return process.env.REACT_APP_BASE_APP_URL
}