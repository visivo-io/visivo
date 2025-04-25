from tests.factories.model_factories import JobFactory
from visivo.jobs.job_tracker import JobTracker


class MockFuture:
    def __init__(self, done):
        self.is_done = done

    def done(self):
        return self.is_done


def test_JobTracker_is_job_name_done():
    job_tracker = JobTracker()
    job = JobFactory()
    job_tracker.track_job(job)

    assert not job_tracker.is_job_name_done(job_name=job.name)

    job.set_future(MockFuture(True))

    assert job_tracker.is_job_name_done(job_name=job.name)


def test_JobTracker_enqueued():
    job_tracker = JobTracker()
    job = JobFactory()
    job_tracker.track_job(job)

    assert job_tracker.is_job_name_enqueued(job_name=job.name)

    job.set_future(MockFuture(False))

    assert job_tracker.is_job_name_enqueued(job_name=job.name)

    job.set_future(MockFuture(True))

    assert job_tracker.is_job_name_enqueued(job_name=job.name)


def test_JobTracker_all_tracked_job_names():
    job_tracker = JobTracker()
    job = JobFactory()
    job_tracker.track_job(job=job)

    assert job_tracker.all_tracked_job_names == {"trace"}


def test_JobTracker_is_job_name_done():
    job_tracker = JobTracker()
    job = JobFactory()
    job.set_future(MockFuture(True))
    job_tracker.track_job(job=job)

    assert job_tracker.is_job_name_done(job.name)


def test_JobTracker_is_done():
    job_tracker = JobTracker()
    job = JobFactory()
    job_tracker.track_job(job=job)

    assert not job_tracker.is_done()

    job.set_future(MockFuture(True))

    assert job_tracker.is_done()
