from .base.named_model import NamedModel


class Test(NamedModel):
    logic: str

    __test__ = False
