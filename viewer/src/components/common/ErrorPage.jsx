import { Link, useRouteError } from 'react-router-dom'

const ErrorPage = (props) => {
  let error = useRouteError();

  let title = "500"
  let message = "Whoops, an unexpected error has occurred."
  if (error) {
    title = error.status
    if (error.status === 404) {
      message = "Sorry, the page you're looking for can't be found."
    }
  }
  if (props.message) {
    message = props.message
  }
  if (props.status) {
    title = props.status
  }
  return (
    <div className="flex justify-center items-center mt-4">
      <div className="text-center">
        <h1 className="text-6xl font-medium">{title}</h1>
        <p className="text-xl font-medium m-6">{message}</p>
        <Link to="/" className="bg-primary-500 hover:bg-primary-600 text-white py-2 px-4 rounded-xs">Home</Link>
      </div>
    </div>
  )
}

export default ErrorPage
