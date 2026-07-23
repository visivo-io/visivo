from visivo.parsers.mkdocs_utils.markdown import (
    from_insightprop_model,
    from_pydantic_model,
    from_traceprop_model,
    insight_props_index,
    find_refs,
)
from visivo.parsers.mkdocs_utils.nav_configuration_generator import (
    mkdocs_pydantic_nav,
    get_model_to_page_mapping,
    get_model_to_path_mapping,
    get_model_to_paths_mapping,
    find_path,
    replace_using_path,
)
from visivo.parsers.schema_generator import generate_schema
import json

# Synthetic "model" name for the generated Insight Props card-grid index page.
# It is not a real Pydantic model — it stands in for the index.md that replaces
# the ~49 per-prop nav leaves under Reference > Configuration > Insight > Props.
INSIGHT_PROPS_INDEX_MODEL = "InsightPropsIndex"
INSIGHT_PROPS_INDEX_NAV_PATH = "reference/configuration/Insight/Props/index.md"
INSIGHT_PROPS_INDEX_FILE_PATH = "mkdocs/" + INSIGHT_PROPS_INDEX_NAV_PATH


class Mkdocs:
    """Holds SCHEMA state so that upstream scripts only need to run that import once."""

    SCHEMA = json.loads(generate_schema())

    nav_configuration = mkdocs_pydantic_nav(SCHEMA)
    model_to_page_map = get_model_to_page_mapping(nav_configuration)
    model_to_path_map = get_model_to_path_mapping(nav_configuration)
    # Every nav leaf for a model, so a model reused by several parents gets a
    # page written at each of them (see get_model_to_paths_mapping).
    model_to_paths_map = get_model_to_paths_mapping(nav_configuration)
    # The per-prop reference pages keep generating (so they stay reachable via
    # the index cards + site search), but they are collapsed out of the committed
    # nav into a single card-grid index page — register that page for writing.
    model_to_path_map[INSIGHT_PROPS_INDEX_MODEL] = INSIGHT_PROPS_INDEX_FILE_PATH
    model_to_paths_map[INSIGHT_PROPS_INDEX_MODEL] = [INSIGHT_PROPS_INDEX_FILE_PATH]

    def get_model_object(self, model_name: str):
        return self.SCHEMA.get(model_name)

    def get_nav_configuration(self):
        return self.nav_configuration

    def update_mkdocs_yaml_configuration(self, mkdocs_yaml_object: dict) -> dict:
        mkdocs_nav = mkdocs_yaml_object.get("nav", {})
        if not mkdocs_nav:
            raise KeyError(
                "Expecting nav key in the mkdocs.yml file. Perhaps the schema was changed in an update?"
            )
        configuration_path = find_path(mkdocs_nav, "Configuration")
        if not configuration_path:
            raise LookupError(
                "'Configuration' key was not found anywhere in the mkdocs.nav object."
            )
        updated_mkdocs_nav = replace_using_path(
            mkdocs_nav, configuration_path, self.get_nav_configuration()
        )

        def collapse_props_subtree(updated_mkdocs_nav):
            """Replaces the ~49 per-prop nav leaves under Insight > Props with a
            single entry pointing at the generated card-grid index page. The
            individual prop pages still GENERATE and stay reachable via the index
            cards + site search — they are just no longer individual nav lines."""
            props_path = find_path(updated_mkdocs_nav, "Props")
            if not props_path:
                # No Props subtree in this nav (e.g. minimal test fixtures) — nothing to do.
                return
            replace_using_path(
                updated_mkdocs_nav,
                props_path,
                [INSIGHT_PROPS_INDEX_NAV_PATH],
            )

        collapse_props_subtree(updated_mkdocs_nav)
        mkdocs_yaml_object["nav"] = updated_mkdocs_nav
        return mkdocs_yaml_object

    def _replace_model_with_page(self, md: str) -> str:

        sorted_map = dict(
            sorted(
                self.model_to_page_map.items(),
                key=lambda item: len(item[0]),
                reverse=True,
            )
        )
        for def_string, page_string in sorted_map.items():
            if def_string in md:
                md = md.replace(def_string, page_string)
        return md

    def _get_insight_prop_models(self) -> list:
        """Helper function to get the list of insight prop models. Enables a better error if the model is not found."""
        insight_props_def = self.SCHEMA["$defs"].get("Insight").get("properties").get("props")
        refs = list(set(find_refs(insight_props_def["oneOf"])))
        insight_prop_models = [i.split("/")[-1] for i in refs]
        return insight_prop_models

    def _props_index_links(self) -> list:
        """Returns (model_name, relative_link) tuples for every insight prop page,
        plus the `Line`/`Area` aliases that the nav points at the Scatter page.
        Links are relative to the Props index page's own directory (so a bare
        `Bar/` resolves to .../Insight/Props/Bar/)."""
        prop_models = sorted(self._get_insight_prop_models())
        links = [(model, f"{model}/") for model in prop_models]
        # Line & Area are nav aliases of Scatter (same generated page).
        for alias in ("Area", "Line"):
            links.append((alias, "Scatter/"))
        return sorted(links, key=lambda pair: pair[0])

    def get_props_index_content(self) -> str:
        """Generates the Insight Props card-grid index page markdown."""
        return insight_props_index(self._props_index_links())

    def get_md_content(self, model_name, content_type=""):
        if model_name == INSIGHT_PROPS_INDEX_MODEL:
            return self.get_props_index_content()

        path = self.model_to_path_map.get(model_name, {})

        insight_prop_models = self._get_insight_prop_models()

        if not path:
            raise KeyError(f"model {model_name} not found in project")
        if model_name in insight_prop_models:
            md = from_insightprop_model(self.SCHEMA["$defs"], model_name)
        elif model_name == "Layout":
            md = from_traceprop_model(self.SCHEMA["$defs"], model_name)
        else:
            md = from_pydantic_model(self.SCHEMA["$defs"], model_name)

        md = self._replace_model_with_page(md=md)
        return md
