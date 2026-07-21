"""Tests for migrating csv script models onto sources with seeds."""

import os

from ruamel.yaml import YAML

from visivo.models.deprecations.model_type_deprecation import (
    ModelTypeDeprecationChecker,
    migrate_markdown_text,
    migrate_yaml_text,
)

CSV_SCRIPT_YAML = """models:
  - name: quests
    table_name: quests_table
    args:
      - echo
      - |
        x,y
        1,2
"""


def load(text):
    return YAML().load(text)


class TestMigrateYamlText:
    def test_emits_a_duckdb_source_carrying_the_seed(self):
        result, _ = migrate_yaml_text(CSV_SCRIPT_YAML)
        source = load(result)["sources"][0]

        assert source["name"] == "quests-source"
        assert source["type"] == "duckdb"
        assert source["database"] == "target/seeds/quests.duckdb"
        assert source["seeds"][0]["table_name"] == "quests_table"
        assert source["seeds"][0]["args"][0] == "echo"

    def test_model_becomes_a_sql_model_pointed_at_the_new_source(self):
        result, _ = migrate_yaml_text(CSV_SCRIPT_YAML)
        model = load(result)["models"][0]

        assert model == {
            "name": "quests",
            "source": "${ref(quests-source)}",
            "sql": "select * from quests_table",
        }

    def test_table_name_defaults_to_model(self):
        result, _ = migrate_yaml_text("models:\n  - name: q\n    args: [echo, 'x\\n1']\n")
        document = load(result)

        assert document["sources"][0]["seeds"][0]["table_name"] == "model"
        assert document["models"][0]["sql"] == "select * from model"

    def test_allow_empty_is_carried_over_only_when_set(self):
        with_flag, _ = migrate_yaml_text(
            "models:\n  - name: q\n    allow_empty: true\n    args: [echo]\n"
        )
        without, _ = migrate_yaml_text("models:\n  - name: q\n    args: [echo]\n")

        assert load(with_flag)["sources"][0]["seeds"][0]["allow_empty"] is True
        assert "allow_empty" not in load(without)["sources"][0]["seeds"][0]

    def test_multiline_block_scalars_survive(self):
        result, _ = migrate_yaml_text(CSV_SCRIPT_YAML)
        assert load(result)["sources"][0]["seeds"][0]["args"][1] == "x,y\n1,2\n"

    def test_comments_are_preserved(self):
        text = "# top comment\nmodels:\n  # about the model\n  - name: q\n    args: [echo]\n"
        result, _ = migrate_yaml_text(text)

        assert "# top comment" in result
        assert "# about the model" in result

    def test_appends_to_an_existing_sources_list(self):
        text = (
            "sources:\n  - name: existing\n    type: duckdb\n    database: e.duckdb\n"
            "models:\n  - name: q\n    args: [echo]\n"
        )
        sources = load(migrate_yaml_text(text)[0])["sources"]

        assert [source["name"] for source in sources] == ["existing", "q-source"]

    def test_disambiguates_a_colliding_source_name(self):
        text = (
            "sources:\n  - name: q-source\n    type: duckdb\n    database: e.duckdb\n"
            "models:\n  - name: q\n    args: [echo]\n"
        )
        document = load(migrate_yaml_text(text)[0])

        assert document["sources"][1]["name"] == "q-source-2"
        assert document["models"][0]["source"] == "${ref(q-source-2)}"

    def test_unrelated_model_keys_are_carried_through(self):
        text = "models:\n  - name: q\n    args: [echo]\n    description: keep me\n"
        assert load(migrate_yaml_text(text)[0])["models"][0]["description"] == "keep me"

    def test_migrates_every_csv_model_in_a_file(self):
        text = "models:\n  - name: a\n    args: [echo]\n  - name: b\n    args: [echo]\n"
        result, descriptions = migrate_yaml_text(text)

        assert len(descriptions) == 2
        assert [s["name"] for s in load(result)["sources"]] == ["a-source", "b-source"]

    def test_leaves_sql_models_alone(self):
        assert migrate_yaml_text("models:\n  - name: q\n    sql: select 1\n") is None

    def test_leaves_local_merge_models_alone(self):
        text = "models:\n  - name: m\n    sql: select 1\n    models: [ref(a)]\n"
        assert migrate_yaml_text(text) is None

    def test_returns_none_for_files_without_models(self):
        assert migrate_yaml_text("sources:\n  - name: s\n") is None

    def test_returns_none_for_unparseable_yaml(self):
        assert migrate_yaml_text("models: [oops\n") is None


class TestMigrateMarkdownText:
    def test_rewrites_a_yaml_fence(self):
        text = f"Some prose.\n\n```yaml\n{CSV_SCRIPT_YAML}```\n\nMore prose.\n"
        result, descriptions = migrate_markdown_text(text)

        assert len(descriptions) == 1
        assert "seeds:" in result
        assert result.startswith("Some prose.")
        assert result.endswith("More prose.\n")

    def test_rewrites_every_fence(self):
        text = f"```yaml\n{CSV_SCRIPT_YAML}```\ntext\n```yaml\n{CSV_SCRIPT_YAML}```\n"
        _, descriptions = migrate_markdown_text(text)
        assert len(descriptions) == 2

    def test_leaves_non_yaml_fences_alone(self):
        text = "```python\nmodels = 1\n```\n"
        assert migrate_markdown_text(text) is None

    def test_returns_none_when_no_fence_needs_migrating(self):
        assert (
            migrate_markdown_text("```yaml\nmodels:\n  - name: q\n    sql: select 1\n```\n") is None
        )


class TestChecker:
    def _project(self, tmp_path, files):
        (tmp_path / "project.visivo.yml").write_text("name: p\n")
        for name, content in files.items():
            path = tmp_path / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
        return str(tmp_path)

    def test_collects_rewrites_from_yaml_files(self, tmp_path):
        working_dir = self._project(tmp_path, {"models.visivo.yml": CSV_SCRIPT_YAML})
        rewrites = ModelTypeDeprecationChecker().get_rewrites_from_files(working_dir)

        assert len(rewrites) == 1
        assert "seeds:" in rewrites[0].new_content

    def test_skips_markdown_unless_asked(self, tmp_path):
        working_dir = self._project(tmp_path, {"doc.md": f"```yaml\n{CSV_SCRIPT_YAML}```\n"})

        assert ModelTypeDeprecationChecker().get_rewrites_from_files(working_dir) == []
        assert (
            len(
                ModelTypeDeprecationChecker().get_rewrites_from_files(
                    working_dir, include_markdown=True
                )
            )
            == 1
        )

    def test_generated_source_avoids_a_name_used_by_any_object_type(self, tmp_path):
        """Visivo names are global, so a generated source must dodge a dashboard
        name in another file just as carefully as another source's."""
        working_dir = self._project(
            tmp_path,
            {
                "project.visivo.yml": "name: p\ndashboards:\n  - name: quests-source\n",
                "models.visivo.yml": "models:\n  - name: quests\n    args: [echo]\n",
            },
        )
        rewrites = ModelTypeDeprecationChecker().get_rewrites_from_files(working_dir)
        rewrite = [r for r in rewrites if str(r.file_path).endswith("models.visivo.yml")][0]
        document = load(rewrite.new_content)

        assert document["sources"][0]["name"] == "quests-source-2"
        assert document["models"][0]["source"] == "${ref(quests-source-2)}"

    def test_generated_names_are_unique_across_files(self, tmp_path):
        working_dir = self._project(
            tmp_path,
            {
                "a.visivo.yml": "models:\n  - name: q\n    args: [echo]\n",
                "b.visivo.yml": "models:\n  - name: q\n    args: [echo]\n",
            },
        )
        rewrites = ModelTypeDeprecationChecker().get_rewrites_from_files(working_dir)
        names = sorted(load(r.new_content)["sources"][0]["name"] for r in rewrites)

        assert names == ["q-source", "q-source-2"]

    def test_reports_local_merge_models_as_unmigratable(self, tmp_path):
        working_dir = self._project(
            tmp_path,
            {
                "models.visivo.yml": "models:\n  - name: joined\n    sql: select 1\n    models: [ref(a)]\n"
            },
        )
        warnings = ModelTypeDeprecationChecker().get_unmigratable(working_dir)

        assert len(warnings) == 1
        assert "joined" in warnings[0].subject
        assert "seeded onto one shared source" in warnings[0].guidance
