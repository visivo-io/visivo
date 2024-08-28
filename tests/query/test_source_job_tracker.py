from tests.factories.model_factories import JobFactory, SourceFactory
from visivo.query.jobs.job import Job
from visivo.query.source_job_tracker import SourceJobTracker


class MockFuture:
    def __init__(self, done):
        self.is_done = done

    def done(self):
        return self.is_done


def test_SourceJobTracker_is_accepting_job():
    source_job_limits = SourceJobTracker()
    job = JobFactory()

    source_job_limits.track_job(job)

    assert source_job_limits.is_accepting_job(job)

    job.set_future(MockFuture(False))

    assert not source_job_limits.is_accepting_job(job)

    job.set_future(MockFuture(True))

    assert source_job_limits.is_accepting_job(job)


def test_SourceJobTracker_is_job_name_done():
    source_job_limits = SourceJobTracker()
    job = JobFactory()
    source_job_limits.track_job(job)

    assert not source_job_limits.is_job_name_done(job_name=job.name)

    job.set_future(MockFuture(True))

    assert source_job_limits.is_job_name_done(job_name=job.name)


def test_SourceJobTracker_enqueued():
    source_job_limits = SourceJobTracker()
    job = JobFactory()
    source_job_limits.track_job(job)

    assert source_job_limits.is_job_name_enqueued(job_name=job.name)

    job.set_future(MockFuture(False))

    assert source_job_limits.is_job_name_enqueued(job_name=job.name)

    job.set_future(MockFuture(True))

    assert source_job_limits.is_job_name_enqueued(job_name=job.name)


def test_SourceJobTracker_all_tracked_job_names():
    source_job_limits = SourceJobTracker()
    job = JobFactory()
    source_job_limits.track_job(job=job)

    assert source_job_limits.all_tracked_job_names == {"trace"}


def test_SourceJobTracker_all_done_job_names():
    source_job_limits = SourceJobTracker()
    job = JobFactory()
    job.set_future(MockFuture(True))

    source_job_limits.track_job(job=job)
    source_job_limits.is_done()

    assert source_job_limits.all_done_job_names == {"trace"}


def test_SourceJobTracker_is_done():
    source_job_limits = SourceJobTracker()
    job = JobFactory()
    source_job_limits.track_job(job=job)

    assert not source_job_limits.is_done()

    job.set_future(MockFuture(True))

    assert source_job_limits.is_done()
