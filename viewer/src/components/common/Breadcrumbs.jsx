import React from 'react';
import { useMatches } from 'react-router-dom';

const Breadcrumbs = () => {
  let matches = useMatches();
  let crumbs = matches
    .filter(match => Boolean(match.handle?.crumb))
    .map(match => match.handle.crumb(match));

  return (
    <nav data-testid="breadcrumbs" className="w-full rounded-md bg-grey-light m-2">
      <ol className="list-reset flex">
        {crumbs.map((crumb, index) => (
          <li key={index}>
            {index !== 0 && <span className="ml-2 mr-2"> / </span>}
            {crumb}
          </li>
        ))}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;
