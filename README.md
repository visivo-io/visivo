# Usage

Please refer to https://docs.visivo.io for detailed instructions on how to use this package.

## Install

```
python -m pip install git+https://github.com/visivo-io/visivo.git@latest --force-reinstall
```

# Development

## Viewer

The local development environment is a basic Create React App setup.  You can test any changes by:

1. Install Visivo from above.
1. Start `visivo serve` on a project.  You can do this in on `test-projects` in this repo. This acts as the server for your changes.
1. In another terminal start the react app.  
    1. `cd viewer`
    1. `yarn start`
    1. Navigate to localhost:3000 this will proxy any data requests to the running `visivo serve` command 