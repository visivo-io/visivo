![PyPI](https://img.shields.io/pypi/v/visivo?label=pypi%20package)
![PyPI - Downloads](https://img.shields.io/pypi/dm/visivo)

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

## Quickstart

To get started with Visivo, follow these steps:

1. Install Visivo using pip: `pip install visivo`
2. Create a new project using `visivo init --project-name quick_start`.
3. Choose `sqlite` for a quickstart.
4. Navigate into the new project folder you just created with `cd quick_start`
5. Run `visivo serve` to start the development server
6. Open your web browser and navigate to `http://localhost:8000` to view your charts

# Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/visivo-io/visivo/tags). 

# Development

There are two pieces to the local Visivo deployment, the python CLI and the javascript viewer.  When packaged, the viewer is contained in the CLI, but it is needed to be able to develop them separately locally.

## CLI

The development of the python CLI is straight forward.  The code is contained within the `visivo` folder in this repo, and we use `poetry` as its package manager.

### Prerequisites

1. Python 3.10+
2. Poetry: `pip install poetry`
3. Dependencies: `poetry install`

### Commands

* Test: `poetry run pytest`

## Viewer

The local development environment is a basic Create React App setup. It uses `yarn` as its package manager and commands can be found in the `package.json`.

### Prerequisites

1. Node 20+
2. Yarn: `npm install -g yarn`
3. Dependencies: `yarn install`

### Commands

* Test: `yarn test`
* Start: `yarn start`

If you need to run it locally as an app, you need a API for it to proxy to.  You can do this be running visivo on a local project by:

1. Install Visivo from above. Either the development or `pip` install.
2. Start `visivo serve` on a project. You can do this in on `test-projects` in this repo. This acts as the server for your changes.
3. In another terminal start the react app.
   a. `cd viewer`
   b. `yarn start`
   c. Navigate to localhost:3000 this will proxy any data requests to the running `visivo serve` command

## Generating a Release

A release is created by running the action `Create Release`. This will create a tag and trigger the deployment of the viewer. The input is without the `v` prefix. Example: `1.3.4`.

# Authors

* Visivo LLC - [YourWebsite](https://visivo.io/)

See also the list of [contributors](https://github.com/visivo-io/visivo/contributors) who participated in this project.
