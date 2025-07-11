import React from 'react';
import { Visivo } from './index';

/**
 * Example React component showing how to use Visivo embed components
 */
export const ReactExample = () => {
  const handleLoad = data => {
    console.log('Visivo component loaded:', data);
  };

  const handleError = error => {
    console.error('Visivo component error:', error);
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <h1 style={{ textAlign: 'center', color: '#333' }}>Visivo React Embed Examples</h1>

      <div style={{ marginBottom: '40px' }}>
        <h2 style={{ color: '#555', borderBottom: '2px solid #ddd', paddingBottom: '10px' }}>
          Chart Example
        </h2>
        <div
          style={{
            height: '400px',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}
        >
          <Visivo
            project="my-project"
            stage="production"
            item="revenue-chart"
            host="https://api.visivo.io"
            apiKey="your-api-key-here"
            style={{ height: '100%', width: '100%' }}
            onLoad={handleLoad}
            onError={handleError}
            loading={<div style={{ padding: '20px', textAlign: 'center' }}>Loading chart...</div>}
          />
        </div>
      </div>

      <div style={{ marginBottom: '40px' }}>
        <h2 style={{ color: '#555', borderBottom: '2px solid #ddd', paddingBottom: '10px' }}>
          Table Example
        </h2>
        <div
          style={{
            height: '400px',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}
        >
          <Visivo
            project="my-project"
            stage="production"
            item="sales-table"
            host="https://api.visivo.io"
            apiKey="your-api-key-here"
            style={{ height: '100%', width: '100%' }}
            onLoad={handleLoad}
            onError={handleError}
            loading={<div style={{ padding: '20px', textAlign: 'center' }}>Loading table...</div>}
          />
        </div>
      </div>

      <div style={{ marginBottom: '40px' }}>
        <h2 style={{ color: '#555', borderBottom: '2px solid #ddd', paddingBottom: '10px' }}>
          Dashboard Example
        </h2>
        <div
          style={{
            minHeight: '600px',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}
        >
          <Visivo
            project="my-project"
            stage="production"
            item="executive-dashboard"
            host="https://api.visivo.io"
            apiKey="your-api-key-here"
            style={{ width: '100%' }}
            onLoad={handleLoad}
            onError={handleError}
            loading={
              <div style={{ padding: '20px', textAlign: 'center' }}>Loading dashboard...</div>
            }
          />
        </div>
      </div>

      <div
        style={{
          marginTop: '40px',
          padding: '20px',
          backgroundColor: 'white',
          borderRadius: '8px',
        }}
      >
        <h2>Usage Instructions</h2>
        <p>To use these components in your own React application:</p>
        <ol>
          <li>
            Build the embed library: <code>yarn build:embed</code>
          </li>
          <li>
            Import the component: <code>import {`{ Visivo }`} from './src/embed';</code>
          </li>
          <li>Use the component with your project details</li>
          <li>Make sure your Visivo server has the embed API endpoints enabled</li>
        </ol>

        <h3>Required Props</h3>
        <ul>
          <li>
            <strong>project</strong>: The name of your Visivo project
          </li>
          <li>
            <strong>stage</strong>: The stage name (e.g., 'production', 'dev')
          </li>
          <li>
            <strong>item</strong>: The name of the dashboard, chart, table, or markdown to embed
          </li>
        </ul>

        <h3>Optional Props</h3>
        <ul>
          <li>
            <strong>host</strong>: Your Visivo API URL (defaults to https://api.visivo.io)
          </li>
          <li>
            <strong>apiKey</strong>: Your API key for authentication (required for private projects)
          </li>
          <li>
            <strong>style</strong>: CSS styles to apply to the container
          </li>
          <li>
            <strong>className</strong>: CSS class name for the container
          </li>
          <li>
            <strong>loading</strong>: Custom loading component
          </li>
          <li>
            <strong>error</strong>: Custom error component
          </li>
          <li>
            <strong>onLoad</strong>: Callback when data loads successfully
          </li>
          <li>
            <strong>onError</strong>: Callback when an error occurs
          </li>
        </ul>
      </div>
    </div>
  );
};
