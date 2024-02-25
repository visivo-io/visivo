from visivo.models.target import Target


class Job:
    def __init__(self, name: str, target: Target, action, **kwargs):
        self.name = name
        self.target = target
        self.action = action
        self.kwargs = kwargs
        self.future = None

    @property
    def future(self, future):
        self.future = future
