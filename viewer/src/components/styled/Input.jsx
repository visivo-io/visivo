import { useRef } from "react";

const Input = (props) => {
    const inputRef = useRef();

    const onClickLabel = () => {
        inputRef.current.focus();
    }
    return (
        <div className="relative">
            <input ref={inputRef} type={props.type ? props.type : "text"} id={props.name} alt={props.alt} value={props.value} onChange={props.onChange} name={props.name} className="block px-2 pb-1 pt-2.5 w-full text-sm text-gray-900 bg-transparent rounded-md border border-gray-300 appearance-none focus:outline-hidden focus:ring-0 focus:border-primary peer" placeholder=" " />
            <label htmlFor={props.name} onClick={onClickLabel} className="absolute text-sm text-gray-500 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white px-2 peer-focus:px-2 peer-focus:text-primary peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 left-1">{props.label}</label>
        </div>
    );
}

export default Input;