from ..base.named_model import NamedModel
from ..test_run import TestRun


class Destination(NamedModel):
    def alert(self, test_run: TestRun):
        raise NotImplementedError("Please Implement this method")
