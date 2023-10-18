def extract_ref_list_from_defs(definition: dict):
    if 'anyOf' in definition.keys():
        return 'temp'
    elif 'items' in definition.keys():
        return [definition.get('items', {}).get('$ref', None)]
    elif 'discriminator' in definition.keys():
        return 
    else:
        return None