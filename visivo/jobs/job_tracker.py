from queue import Queue
from typing import List
from visivo.models.sources.source import Source
from visivo.jobs.job import Job


class JobTracker:
    def __init__(self):
        self.job_queue = Queue()
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

    def track_job(self, job: Job):
        self.__update()
        self.enqueued.append(job)
        self.job_queue.put(job)

    def is_job_name_enqueued(self, job_name: str) -> bool:
        self.__update()
        return job_name in self.all_tracked_job_names

    def is_job_name_done(self, job_name: str) -> bool:
        self.__update()
        return job_name in set(map(lambda job: job.name, self.done))

    def is_job_name_failed(self, job_name: str) -> bool:
        self.__update()
        failed_jobs = list(
            filter(lambda job: job.future and not job.future.result().success, self.done)
        )
        return job_name in set(map(lambda job: job.name, failed_jobs))

    def is_done(self) -> bool:
        self.__update()
        return (len(self.running) + len(self.enqueued)) == 0

    def return_to_queue(self, job: Job):
        self.job_queue.put(job)

    def get_next_job(self) -> Job:
        self.__update()
        return self.job_queue.get(timeout=0.01)

    def empty(self) -> bool:
        return self.job_queue.empty()

    def __update(self):
        self.done = (
            self.done
            + list(filter(lambda job: job.done(), self.running))
            + list(filter(lambda job: job.done(), self.enqueued))
        )
        self.running = list(filter(lambda job: job.running(), self.running)) + list(
            filter(lambda job: job.running(), self.enqueued)
        )

        self.enqueued = list(filter(lambda job: not job.future, self.enqueued))
