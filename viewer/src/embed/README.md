# Visivo Embed Components

This directory contains the embeddable components that allow Visivo dashboards, charts, tables, and markdown to be embedded in external websites.

## Overview

The Visivo embed system provides two main ways to embed Visivo content:

1. **React Component** - `<Visivo />` component for React applications
2. **Global JavaScript** - Script tag usage for non-React websites

## Building the Embed Components

To build the embed components, run:

```bash
# Build both library and global versions
yarn build:embed

# Build just the library version (for React apps)
yarn build:embed:lib

# Build just the global version (for script tag usage)
yarn build:embed:global
```

The built files will be in the `embed-dist/` directory:
- `index.esm.js` - ES modules for React apps
- `index.cjs.js` - CommonJS for React apps
- `visivo-embed.js` - Global build for script tag usage

## Usage

### For React Applications

```jsx
import React from 'react';
import { Visivo } from './src/embed';

function MyDashboard() {
  return (
    <Visivo 
      project="my-project"
      stage="production"
      item="sales-dashboard"
      host="https://api.visivo.io"
      apiKey="your-api-key-here"
      style={{ height: '500px', width: '100%' }}
      onLoad={(data) => console.log('Loaded:', data)}
      onError={(error) => console.error('Error:', error)}
    />
  );
}
```

### For Non-React Websites

```html
<div id="visivo-container"></div>
<script src="./embed-dist/visivo-embed.js"></script>
<script>
  window.VisivoEmbed.render(document.getElementById('visivo-container'), {
    project: 'my-project',
    stage: 'production',
    item: 'sales-dashboard',
    host: 'https://api.visivo.io',
    apiKey: 'your-api-key-here'
  });
</script>
```

## Component Props

### Required Props

- **project** (string): The name of your Visivo project
- **stage** (string): The stage name (e.g., 'production', 'dev')
- **item** (string): The name of the dashboard, chart, table, or markdown to embed

### Optional Props

- **host** (string): Your Visivo API URL (defaults to 'https://api.visivo.io')
- **apiKey** (string): Your API key for authentication (required for private projects)
- **style** (React.CSSProperties): CSS styles to apply to the container
- **className** (string): CSS class name for the container
- **loading** (React.ReactNode): Custom loading component
- **error** (React.ReactNode): Custom error component
- **onLoad** (function): Callback when data loads successfully
- **onError** (function): Callback when an error occurs

## API Endpoints

The embed components use these Django API endpoints:

- `GET /api/projects/` - List all projects
- `GET /api/projects/{id}/` - Get specific project details
- `GET /api/stages/` - List all stages
- `GET /api/stages/{id}/` - Get specific stage details  
- `GET /api/traces/{id}/` - Get specific trace data

The embed system resolves project and stage names to IDs by searching through the list endpoints, then fetches detailed data using the ID-based endpoints. Authentication is handled via Bearer tokens passed in the Authorization header.

## Examples

See the example files in this directory:

- `example.html` - Complete HTML example for script tag usage
- `ReactExample.tsx` - React component examples
- `Visivo.tsx` - Main embeddable component

## Architecture

The embed system works by:

1. **Data Fetching**: Uses the embed API endpoints to fetch project and trace data
2. **Component Rendering**: Reuses the existing viewer components (Dashboard, Item)
3. **Context Provision**: Provides necessary React context for the viewer components
4. **Error Handling**: Graceful error handling and loading states

The embed system now uses the new `Item` component which consolidates the logic for rendering charts, tables, selectors, and markdown content. This makes the code more modular and consistent between the main viewer and embedded components.

## File Structure

```
embed/
├── Visivo.jsx           # Main embeddable component
├── api.js               # Data fetching functions
├── index.jsx            # React export entry point
├── global.jsx           # Global export entry point
├── EmbedProvider.jsx    # Context provider for viewer components
├── ReactExample.jsx     # React usage examples
├── example.html         # HTML usage example
└── README.md           # This file

../items/
├── Item.jsx             # New unified item rendering component
├── Chart.jsx            # Chart component (used by Item)
├── Table.jsx            # Table component (used by Item)
└── Selector.jsx         # Selector component (used by Item)
```

## Development

To develop and test the embed components:

1. Start the Visivo server: `visivo run`
2. Make sure you have a project with dashboards, charts, or tables
3. Build the embed components: `yarn build:embed`
4. Open `example.html` in a browser to test the global build
5. Create a test React app to test the React component

## Deployment

After building, the embed components can be:

1. **NPM Package**: Publish the library build to NPM
2. **CDN Distribution**: Host the global build on a CDN
3. **Self-hosted**: Include the built files in your own hosting

The global build (`visivo-embed.js`) includes all dependencies and can be used directly via script tag.