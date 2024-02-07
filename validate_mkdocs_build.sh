#!/bin/bash

if grep -q "WARNING -  mkdocs_spellcheck" build_stdout.txt; then
  echo "Spelling errors were found in the docs. Please fix the error or add the words to the mkdocs/known_words.txt"
  exit 1
else 
  echo "You spel purtty guod"
fi

