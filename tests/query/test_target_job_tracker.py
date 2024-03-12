from tests.factories.model_factories import JobFactory, TargetFactory
from visivo.query.jobs.job import Job
from visivo.query.target_job_tracker import TargetJobTracker


class MockFuture:
    def __init__(self, done):
        self.is_done = done

    def done(self):
        return self.is_done


def test_TargetJobTracker_is_accepting_job():
    target_job_limits = TargetJobTracker()
    job = JobFactory()

    target_job_limits.track_job(job)

    assert target_job_limits.is_accepting_job(job)

    job.set_future(MockFuture(False))

    assert not target_job_limits.is_accepting_job(job)

    job.set_future(MockFuture(True))

    assert target_job_limits.is_accepting_job(job)


def test_TargetJobTracker_is_job_name_done():
    target_job_limits = TargetJobTracker()
    job = JobFactory()
    target_job_limits.track_job(job)

    assert not target_job_limits.is_job_name_done(job_name=job.name)

    job.set_future(MockFuture(True))

    assert target_job_limits.is_job_name_done(job_name=job.name)


def test_TargetJobTracker_enqueued():
    target_job_limits = TargetJobTracker()
    job = JobFactory()
    target_job_limits.track_job(job)

    assert target_job_limits.is_job_name_enqueued(job_name=job.name)

    job.set_future(MockFuture(False))

    assert target_job_limits.is_job_name_enqueued(job_name=job.name)

    job.set_future(MockFuture(True))

    assert target_job_limits.is_job_name_enqueued(job_name=job.name)


def test_TargetJobTracker_all_tracked_job_names():
    target_job_limits = TargetJobTracker()
    job = JobFactory()
    target_job_limits.track_job(job=job)

    assert target_job_limits.all_tracked_job_names == {"trace"}


def test_TargetJobTracker_all_done_job_names():
    target_job_limits = TargetJobTracker()
    job = JobFactory()
    job.set_future(MockFuture(True))

    target_job_limits.track_job(job=job)
    target_job_limits.is_done()

    assert target_job_limits.all_done_job_names == {"trace"}


def test_TargetJobTracker_is_done():
    target_job_limits = TargetJobTracker()
    job = JobFactory()
    target_job_limits.track_job(job=job)

    assert not target_job_limits.is_done()

    job.set_future(MockFuture(True))

    assert target_job_limits.is_done()
