from queue import Queue
from typing import List
from visivo.models.sources.source import Source
from visivo.query.jobs.job import Job


class SourceLimit:
    def __init__(self, source: Source):
        self.source_name = source.name
        self.limit = 1
        if hasattr(source, "connection_pool_size"):
            self.limit = source.connection_pool_size
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


class SourceJobTracker:
    def __init__(self):
        self.source_limits: List[SourceLimit] = []
        self.job_queue = Queue()

    @property
    def source_names(self):
        return list(
            map(lambda source_limit: source_limit.source_name, self.source_limits)
        )

    @property
    def all_tracked_job_names(self):
        all_tracked_job_names = set()
        for source_limit in self.source_limits:
            all_tracked_job_names = all_tracked_job_names.union(
                source_limit.all_tracked_job_names
            )
        return all_tracked_job_names

    @property
    def all_done_job_names(self):
        all_done_job_names = set()
        for source_limit in self.source_limits:
            all_done_job_names = all_done_job_names.union(
                source_limit.all_done_job_names
            )
        return all_done_job_names

    def is_accepting_job(self, job: Job):
        self.__add_source(job.source)
        self.__update()
        source_limit = next(
            source_limit
            for source_limit in self.source_limits
            if source_limit.source_name == job.source.name
        )
        return source_limit.is_accepting_job()

    def track_job(self, job: Job):
        self.__add_source(job.source)
        self.__update()
        for source_limit in self.source_limits:
            if source_limit.source_name == job.source.name:
                source_limit.enqueued.append(job)
                self.job_queue.put(job)

    def is_job_name_enqueued(self, job_name: str) -> bool:
        self.__update()
        return job_name in self.all_tracked_job_names

    def is_job_name_done(self, job_name: str) -> bool:
        self.__update()
        return job_name in self.all_done_job_names

    def is_done(self) -> bool:
        self.__update()
        for source_limit in self.source_limits:
            if source_limit.is_processing():
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
        for source_job_limit in self.source_limits:
            source_job_limit.update()

    def __add_source(self, source):
        if source.name not in self.source_names:
            self.source_limits.append(SourceLimit(source=source))
