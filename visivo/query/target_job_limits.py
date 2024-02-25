from typing import List
from visivo.models.target import Target
from visivo.query.jobs.job import Job


class TargetLimit:
    def __init__(self, target: Target):
        self.target_name = target.name
        self.limit = 1
        if target.connection_pool_size:
            self.limit = target.connection_pool_size
        self.running = []
        self.done = []

    @property
    def running(self):
        return len(self.running) > 0

    def update_done(self):
        self.done.append(list(filter(lambda future: future.done(), self.running)))
        self.running = list(filter(lambda future: not future.done(), self.running))


class TargetJobLimits:
    def __init__(self):
        self.target_limits: List[TargetLimit] = []

    @property
    def target_names(self):
        list(map(lambda target_name: target_name, self.target_limits.target_name))

    def accepting_job(self, job: Job):
        self.__add_target(job.target)
        self.__update_done()
        return (
            self.target_limits[job.target.name]["limit"]
            - len(self.target_limits[job.target.name]["running"])
        ) > 0

    def track_job(self, job: Job):
        self.__update_done()
        for target_limit in self.target_limits:
            if target_limit.target_name == job.target.name: 
                target_limit.running.append(job.future)

    def done(self) -> bool:
        self.__update_done()
        for target_limit in self.target_limits:
            if target_limit.running:
                return False
        return True

    def __update_done(self):
        for target_job_limit in self.target_limits:
            target_job_limit.update_done()

    def __add_target(self, target):
        if target.name not in self.target_names:
            self.target_limits.append(TargetLimit(target=target))
