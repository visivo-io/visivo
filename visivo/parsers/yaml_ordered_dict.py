import yaml
import json
from collections import OrderedDict


class YamlOrderedDict(OrderedDict):
    """
    An OrderedDict that was loaded from a yaml file, and is annotated
    with file/line info for reporting about errors in the source file
    """

    def _annotate(self, node):
        self._key_locs = {}
        self._value_locs = {}
        nodeiter = node.value.__iter__()
        for key in self:
            subnode = nodeiter.__next__()
            self._key_locs[key] = (
                subnode[0].start_mark.name + ":" + str(subnode[0].start_mark.line + 1)
            )
            self._value_locs[key] = (
                subnode[1].start_mark.name + ":" + str(subnode[1].start_mark.line + 1)
            )

    def key_loc(self, key):
        try:
            return self._key_locs[key]
        except (AttributeError, KeyError):
            return ""

    def value_loc(self, key):
        try:
            return self._value_locs[key]
        except (AttributeError, KeyError):
            return ""

    def __str__(self):
        return json.dumps(self)


def setup_yaml_ordered_dict():
    # Use YamlOrderedDict objects for yaml maps instead of normal dict
    yaml.add_representer(OrderedDict, lambda dumper, data: dumper.represent_dict(data.items()))
    yaml.add_representer(YamlOrderedDict, lambda dumper, data: dumper.represent_dict(data.items()))

    def _load_YamlOrderedDict(loader, node):
        rv = YamlOrderedDict(loader.construct_pairs(node))
        rv._annotate(node)
        return rv

    yaml.add_constructor(
        yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,
        _load_YamlOrderedDict,
        yaml.SafeLoader,
    )
