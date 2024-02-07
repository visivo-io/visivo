#!/bin/bash

if [ ! -d "./mkdocs_build" ]; then
  echo "Mkdocs build did not execute correctly because the mkdocs_build directory does not exist. Try running poetry run mkdocs serve locally to debug."
  exit 1
else
  echo "Mkdocs build succeeded as ./mkdocs_build directory was found."
fi
