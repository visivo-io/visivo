class TargetJobLimits:
    def __init__(self):
        self.target_limits = {}

    def accepting_job(self, target):
        if target.name not in self.target_limits:
            self.__add_target(target)
        self.__remove_done(target.name)
        return (
            self.target_limits[target.name]["limit"]
            - len(self.target_limits[target.name]["running"])
        ) > 0

    def track_job(self, target, future):
        self.__remove_done(target.name)
        self.target_limits[target.name]["running"].append(future)

    def done(self):
        for target_name in self.target_limits:
            self.__remove_done(target_name)
            if len(self.target_limits[target_name]["running"]) > 0:
                return False
        return True

    def __remove_done(self, target_name):
        self.target_limits[target_name]["running"] = filter(
            lambda f: f.done(), self.target_limits[target_name]["running"]
        )

    def __add_target(self, target):
        limit = 1
        if target.connection_pool_size:
            limit = target.connection_pool_size
        self.target_limits[target.name] = {"limit": limit, "running": []}
