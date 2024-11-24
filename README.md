# Usage

Please refer to https://docs.visivo.io for detailed instructions on how to use this package.

## Install

```
pip install visivo
```

If you want to install a preview version you can install from a beta tag:

```
python -m pip install git+https://github.com/visivo-io/visivo.git@v1.1.0-beta-1 --force-reinstall
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

## Generating a Release

A release is created by running the action `Create Release`.  This will create a tag and trigger the deployment of the viewer. The input is without the `v` prefix. Example: `1.3.4`.
