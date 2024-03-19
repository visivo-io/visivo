from queue import Queue
from typing import List
from visivo.models.targets.target import Target
from visivo.query.jobs.job import Job


class TargetLimit:
    def __init__(self, target: Target):
        self.target_name = target.name
        self.limit = 1
        if hasattr(target, "connection_pool_size"):
            self.limit = target.connection_pool_size
        self.enqueued: List[Job] = []
        self.running: List[Job] = []
        self.done: List[Job] = []

    @property
    def all_tracked_job_names(self):
        return (
            set(map(lambda job: job.name, self.enqueued))
            .union(set(map(lambda job: job.name, self.running)))
            .union(set(map(lambda job: job.name, self.done)))
        )

    @property
    def all_done_job_names(self):
        return set(map(lambda job: job.name, self.done))

    def is_processing(self):
        self.update()
        return (len(self.running) + len(self.enqueued)) > 0

    def is_accepting_job(self):
        self.update()
        return self.limit - len(self.running) > 0

    def update(self):
        self.done = (
            self.done
            + list(filter(lambda job: job.done(), self.running))
            + list(filter(lambda job: job.done(), self.enqueued))
        )
        self.running = list(filter(lambda job: job.running(), self.running)) + list(
            filter(lambda job: job.running(), self.enqueued)
        )

        self.enqueued = list(filter(lambda job: not job.future, self.enqueued))


class TargetJobTracker:
    def __init__(self):
        self.target_limits: List[TargetLimit] = []
        self.job_queue = Queue()

    @property
    def target_names(self):
        return list(
            map(lambda target_limit: target_limit.target_name, self.target_limits)
        )

    @property
    def all_tracked_job_names(self):
        all_tracked_job_names = set()
        for target_limit in self.target_limits:
            all_tracked_job_names = all_tracked_job_names.union(
                target_limit.all_tracked_job_names
            )
        return all_tracked_job_names

    @property
    def all_done_job_names(self):
        all_done_job_names = set()
        for target_limit in self.target_limits:
            all_done_job_names = all_done_job_names.union(
                target_limit.all_done_job_names
            )
        return all_done_job_names

    def is_accepting_job(self, job: Job):
        self.__add_target(job.target)
        self.__update()
        target_limit = next(
            target_limit
            for target_limit in self.target_limits
            if target_limit.target_name == job.target.name
        )
        return target_limit.is_accepting_job()

    def track_job(self, job: Job):
        self.__add_target(job.target)
        self.__update()
        for target_limit in self.target_limits:
            if target_limit.target_name == job.target.name:
                target_limit.enqueued.append(job)
                self.job_queue.put(job)

    def is_job_name_enqueued(self, job_name: str) -> bool:
        self.__update()
        return job_name in self.all_tracked_job_names

    def is_job_name_done(self, job_name: str) -> bool:
        self.__update()
        return job_name in self.all_done_job_names

    def is_done(self) -> bool:
        self.__update()
        for target_limit in self.target_limits:
            if target_limit.is_processing():
                return False
        return True

    def return_to_queue(self, job: Job):
        self.job_queue.put(job)

    def get_next_job(self) -> Job:
        self.__update()
        return self.job_queue.get(timeout=1)

    def empty(self) -> bool:
        return self.job_queue.empty()

    def __update(self):
        for target_job_limit in self.target_limits:
            target_job_limit.update()

    def __add_target(self, target):
        if target.name not in self.target_names:
            self.target_limits.append(TargetLimit(target=target))
