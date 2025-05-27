def _get_ref(field_data):
    refs = []

    # ref = field_data.get("$ref")
    # if ref:
    #     refs.append(ref)
    #     return refs, "ref"

    # Check for ref inside 'items'
    ref = field_data.get("items", {}).get("$ref")
    if ref:
        refs.append(ref)
        return refs, "item"

    # Check for refs inside 'anyOf'
    any_of = field_data.get("anyOf", [])
    if any_of:
        for entry in any_of:
            ref = entry.get("$ref")
            if ref:
                refs.append(ref)
            item_refs = entry.get("items", {}).get("$ref")
            if item_refs:
                refs.append(item_refs)
        return refs, "anyOf"

    # Check for refs inside 'oneOf'
    one_of = field_data.get("items", {}).get("oneOf", [])
    if len(one_of) == 0:
        one_of = field_data.get("oneOf", [])
    if one_of:
        for entry in one_of:
            ref = entry.get("$ref")
            if ref:
                refs.append(ref)
        return refs, "oneOf"

    # Check for refs inside 'discriminator' -> 'mapping'
    mapping_refs = list(field_data.get("discriminator", {}).get("mapping", {}).values())
    if mapping_refs:
        refs.extend(filter(None, mapping_refs))
        return refs, "mapping"

    return refs, None


def _process_model(schema, model_data, processed_models):

    properties = model_data.get("properties", {})
    nested_structure = {}

    for field, field_data in sorted(properties.items()):
        refs, ref_type = _get_ref(field_data)
        if refs and field not in ["props", "layout"] and ref_type != "oneOf":
            for ref in refs:
                nested_model_name = ref.split("/")[-1]
                nested_model_data = schema.get("$defs", {}).get(nested_model_name, {})
                nested_structure[nested_model_name] = _process_model(
                    schema, nested_model_data, processed_models
                )
        elif refs and field in ["props", "layout"]:
            for ref in refs:
                nested_model_name = ref.split("/")[-1]
                nested_model_data = schema.get("$defs", {}).get(nested_model_name, {})
                if field == "props":
                    directory = "Props"
                    # Create a nested directory for the props and layout
                    try:
                        nested_structure[directory][nested_model_name] = {}
                    except KeyError:
                        nested_structure[directory] = {}
                        nested_structure[directory][nested_model_name] = {}
                else:
                    nested_structure[nested_model_name] = {}

        elif refs and ref_type == "oneOf":
            nested_structure[field.capitalize()] = {}
            for ref in refs:
                nested_model_name = ref.split("/")[-1]
                nested_model_data = schema.get("$defs", {}).get(nested_model_name, {})
                nested_structure[field.capitalize()][nested_model_name] = _process_model(
                    schema, nested_model_data, processed_models
                )
        else:
            nested_structure[field] = field_data.get("type", "unknown")

    return nested_structure


def _generate_structure(schema):
    return _process_model(schema, schema, set())


def _to_mkdocs_yaml(schema, structure, base_path="reference/configuration"):
    """Handles taking the flat structure and turning it into the mkdocs yaml format that will
    point to the correct file locations where the model docs will be written."""
    output = []

    for model, contents in structure.items():
        if isinstance(contents, dict):
            sub_path = f"{base_path}/{model}"
            if schema.get("$defs", {}).get(model, {}):
                model_content = {
                    model: [f"{sub_path}/index.md"] + _to_mkdocs_yaml(schema, contents, sub_path)
                }
                output.append(model_content)
            else:
                model_content = {model: _to_mkdocs_yaml(schema, contents, sub_path)}
                output.append(model_content)

    return output


def remove_empty_terminal_nodes(data):
    """Function nested to remove the list and then the dict at an arbitary depth"""

    def _remove_empty_terminal_nodes(data):
        if isinstance(data, list):
            return [remove_empty_terminal_nodes(item) for item in data if item != {}]
        elif isinstance(data, dict):
            return {k: remove_empty_terminal_nodes(v) for k, v in data.items() if v != []}
        return data

    return _remove_empty_terminal_nodes(_remove_empty_terminal_nodes(data))


def _pop_nested_path(dictionary: dict, path: list):
    """Modifies dictionary removing key from a nested path, ignoring nested paths that may have already been removed"""
    result = dictionary
    for key in path[:-1]:
        if isinstance(result, dict) and key in result.keys():
            result = result[key]

    if path[-1] in result.keys():
        result.pop(path[-1])


def _pop_list_of_nested_paths(dictionary: dict, paths: list):
    """Removes a list of nested paths from a dictionary. This is needed because the schema
    is generated with all the models deeply nested within each other. This function
    removes the nested paths to a model so that the nav configuration is not cluttered
    with duplicate models."""
    for path in paths:
        _pop_nested_path(dictionary, path)


def _get_all_key_paths(dictionary, path=None) -> list:
    items = []
    path = path or []
    for key, value in dictionary.items():
        new_path = path + [key]
        if isinstance(value, dict):
            items.append({key: new_path})
            items += _get_all_key_paths(value, new_path)

    return items


def _consolidate_paths(paths: list) -> dict:
    """Finds all the paths to a model and makes a list of path lists stored under the model name as the key."""
    consolidated = {}
    for dictionary in paths:
        model = list(dictionary.keys())[0]
        path = list(dictionary.values())[0]
        if model not in consolidated.keys():
            consolidated[model] = [path]
        elif model in consolidated.keys():
            consolidated[model].append(path)
    return consolidated


def _get_paths_to_remove(consolidated_paths: dict) -> list:
    """Creates a list of all the paths to a model that are not the shortest path. This is needed because
    The schema is generated with all the models deeply nested within each other. This function
    removes the nested paths to a model so that the nav configuration is not cluttered with
    duplicate models."""
    to_remove = []
    for model, paths in consolidated_paths.items():

        top_path_length = 9999
        # find the shortest path to model
        for path in paths:
            if len(path) < top_path_length:
                top_path_length = len(path)
        # add longer paths to to_remove_list
        for path in paths:
            if len(path) != top_path_length:
                to_remove.append(path)
    return to_remove


def mkdocs_pydantic_nav(schema: dict) -> list:
    """Takes the pydantic generated schema and returns the nav configuration that can be used to generate the configuration nav and determines the paths of the model docs files."""
    # Nested structure with all the models deeply nested within each other.
    nested_structure = _generate_structure(schema)
    # All the paths in the nested structure
    all_key_paths = _get_all_key_paths(nested_structure)
    consolidated_paths = _consolidate_paths(all_key_paths)
    paths_to_remove = _get_paths_to_remove(consolidated_paths)
    _pop_list_of_nested_paths(nested_structure, paths=paths_to_remove)
    # After removing the nested paths, the structure is flattened and ready to be converted to mkdocs yaml
    yaml_output = _to_mkdocs_yaml(schema, nested_structure)
    # Remove the empty terminal nodes that are just empty lists, which create empty pages in mkdocs
    cleaned_yaml_output = remove_empty_terminal_nodes(yaml_output.copy())
    return cleaned_yaml_output


def _extract_strings_from_yaml(yaml_obj):
    result = []

    if isinstance(yaml_obj, str):
        return [yaml_obj]

    if isinstance(yaml_obj, list):
        for item in yaml_obj:
            result.extend(_extract_strings_from_yaml(item))

    if isinstance(yaml_obj, dict):
        for key, value in yaml_obj.items():
            result.extend(_extract_strings_from_yaml(value))

    return result


def get_model_to_page_mapping(nav_configuration: list) -> dict:
    """Creates a mapping of model names to their corresponding markdown links."""
    file_paths = _extract_strings_from_yaml(nav_configuration)
    mapping = {}
    for path in file_paths:
        model = path.split("/")[-2]
        key = "#/$defs/" + model
        markdown_link = f"[{model}]" + "(https://docs.visivo.io/" + path.replace("index.md", ")")
        mapping[key] = markdown_link
    return mapping


def get_model_to_path_mapping(nav_configuration: list) -> dict:
    """Creates a mapping of model names to their corresponding file paths. This enables Mkdocs to write the markdown files to the correct location in the untracted mkdocs/reference/configuration folder."""
    file_paths = _extract_strings_from_yaml(nav_configuration)
    mapping = {}
    for path in file_paths:
        model = path.split("/")[-2]
        file_path = "mkdocs/" + path
        mapping[model] = file_path
    return mapping


def find_path(object, key, path=None):
    """Gets the path to traverse through a nested dictionary list to get to a key. Finds the first key that matches."""
    if path is None:
        path = []

    if isinstance(object, dict):
        for k, v in object.items():
            if k == key:
                return path + [k]
            new_path = find_path(v, key, path + [k])
            if new_path:
                return new_path

    if isinstance(object, list):
        for idx, v in enumerate(object):
            new_path = find_path(v, key, path + [idx])
            if new_path:
                return new_path

    return None


def replace_using_path(object, path, new_value):
    current = object
    for idx, step in enumerate(path):
        if idx == len(path) - 1:
            current[step] = new_value
        elif isinstance(current, dict):
            current = current[step]
        elif isinstance(current, list):
            current = current[int(step)]
        else:
            raise ValueError("Invalid path or object structure")
    return object


def get_using_path(object, path):
    current = object
    for step in path:
        if isinstance(current, dict):
            current = current[step]
        elif isinstance(current, list):
            current = current[int(step)]
        else:
            raise ValueError("Invalid path or object structure")
    return current
