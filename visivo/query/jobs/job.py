class Job:
    def __init__(self, name, action, **kwargs):
        self.name = name
        self.action = action
        self.kwargs = kwargs
