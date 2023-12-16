
import React from "react";
import { Link } from 'react-router-dom';
import Dashboard from "./Dashboard";
import Loading from "./Loading";
import Heading from "./styled/Heading";
import { Container } from "./styled/Container";

function Project(props) {
  const renderLoading = () => {
    return (
      <Loading />
    )
  };

  const renderDashboardList = () => {
    return (
      <Container>
        <Heading>Dashboards</Heading>
        <ul>
          {props.dashboards.map((dashboard) =>
            <li key={dashboard.name}>
              <Link className="text-gray-600 hover:text-gray-800" to={dashboard.name} key={dashboard.name}>
                {dashboard.name}
              </Link>
            </li>
          )}
        </ul>
      </Container>
    )
  }
  const renderDashboard = (project) => {
    return (
      <Dashboard project={project} fetchTraces={props.fetchTraces} dashboardName={props.dashboardName} />
    )
  }

  if (props.project && !props.dashboardName) {
    return renderDashboardList(props.project)
  } else if (props.project && props.dashboardName) {
    return renderDashboard(props.project)
  } else {
    return renderLoading()
  }
}

export default Project;

