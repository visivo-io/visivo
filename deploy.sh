pip install poetry
poetry install
npx tailwindcss -i ./mkdocs/stylesheets/input.css -o ./mkdocs/overrides/assets/css/home.css 
poetry run mkdocs build