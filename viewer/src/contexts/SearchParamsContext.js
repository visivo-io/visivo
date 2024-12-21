import { createContext, useState, useEffect } from 'react';
import { useSearchParams } from "react-router-dom";

const SearchParamsContext = createContext();

export const SearchParamsProvider = ({ children }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [state, setState] = useState(Object.fromEntries(searchParams.entries()))

    useEffect(() => {
        setSearchParams(new URLSearchParams(state))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(state)])

    const setStateSearchParam = (name, value) => {
        if (value === null) {
            setState(previousState => {
                delete previousState[name];
                return { ...previousState }
            })
        } else {
            setState(previousState => ({ ...previousState, [name]: value }))
        }
    }

    return (
        <SearchParamsContext.Provider value={[searchParams, setStateSearchParam]}>
            {children}
        </SearchParamsContext.Provider>
    );
};

export default SearchParamsContext;

