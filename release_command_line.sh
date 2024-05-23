git pull
poetry version $1
git add .
git commit -m "Set version $1"
git push
git tag v$1 main
git push origin v$1