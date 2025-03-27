import { json } from "react-router-dom";

export const throwError = (message, status) => {
  throw json({ message: message }, { status: status });
};
