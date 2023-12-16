

import React from "react";
import Viewer from './Viewer'
import { RouterProvider } from "react-router-dom";

function Providers() {
    return (
        <RouterProvider router={Viewer} />
    );
}

export default Providers;