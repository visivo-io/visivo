---
name: project-files
description: Builds and changes a Visivo project through its YAML files and the visivo CLI (init, compile, run, test, serve). Use when the user asks for a source, model, metric, insight, chart, table or dashboard in a Visivo project, or when a visivo command fails.
---

# Work on a Visivo project through its files

A Visivo project is YAML. The project file is `project.visivo.yml`. It can include other YAML files.
You have two ways to change a project. Use one of them for each task.

- **Files and CLI (this skill).** You edit the YAML files and run `visivo` commands. Use this way when no Visivo MCP server is connected, or when the user asks for file changes.
- **MCP drafts.** The `visivo` MCP server writes drafts that a person reviews in the browser. The `mcp-drafts` skill gives the steps.

Do not change the same object through the two ways in one task.

## Before you start

1. Run `visivo --version`. If the command is missing, send the user to https://docs.visivo.io/installation/ and stop.
2. Find `project.visivo.yml`. If the directory has no project, ask the user before you run `visivo init --bare`.
3. Read `AGENTS.md` next to the project file if it exists. It holds the rules of this project.
4. Read the YAML that exists before you add objects. Use the names, sources and metrics that the project already has.

## Change the project

1. Edit the YAML files.
2. Run `visivo compile`. It parses the project and reports each invalid field with its file and line.
3. Correct each error that the command reports. Run `visivo compile` again until it passes.
4. Run `visivo run`. It runs the queries and writes the data that charts read.
5. Run `visivo test` if the project has tests.
6. Tell the user which files changed and which commands passed.

Run each command from the project directory, or add `--working-dir <dir>`.

## Show the result

`visivo serve` starts the local server on http://localhost:8000 and reloads when a file changes.
The command does not stop by itself. Start it in the background, or ask the user to start it in a second terminal.
Use `--port <n>` if port 8000 is in use.

## Rules

- A change that compiles is not complete. It is complete after `visivo run` succeeds.
- Do not put a password, a key or a token in a YAML file. Use `${env.NAME}` and tell the user which variable to set.
- Do not delete a file, a source or a dashboard unless the user asks for it.
- Report a failed command with its error text. Do not report it as a success.

## More guidance

When the `visivo` MCP server is connected, its `read_skill` tool returns the guidance that ships with the installed Visivo version.
Examples are `build-a-model`, `metrics-and-dimensions`, `choose-a-chart` and `design-a-dashboard`.
That guidance names MCP write tools. Its rules for models, metrics, insights and charts also apply to YAML that you write.
The reference for each YAML field is at https://docs.visivo.io.
