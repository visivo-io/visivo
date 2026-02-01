from visivo.models.base.named_model import NamedModel, alpha_hash
from visivo.models.base.context_string import ContextString


def test_NamedModel_get_name():
    assert NamedModel.get_name({"name": "test_name"}) == "test_name"

    model = NamedModel(name="test_model")
    assert NamedModel.get_name(model) == "test_model"

    context_str = ContextString("${ ref(TestName) }")
    assert NamedModel.get_name(context_str) == "TestName"
    assert NamedModel.get_name("${ ref(TestName) }") == "TestName"

    assert NamedModel.get_name("ref(RefName)") == "RefName"


def test_alpha_hash_parity_with_js():
    """
    These expected values are shared with viewer/src/utils/alphaHash.test.js.
    If either side changes, both tests must be updated to stay in sync.
    """
    assert alpha_hash("filter-aggregate-input-test-insight") == "mcfqwfyjithoefqyfitoeuwlatmvb"
    assert alpha_hash("my-model") == "micjrebiipkcjzyxbmihctqqzdpna"
    assert alpha_hash("hello") == "madrobbqxjefimvfiecudmhwqndua"
    assert alpha_hash("some insight with spaces") == "mtinfecofmyxbrtlcezvlufjfdtbb"
    assert alpha_hash("") == "mgiwmxadpdsyvtjdjzkczubjtuutb"
