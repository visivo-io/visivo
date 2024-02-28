from tests.factories.model_factories import TargetFactory, TraceFactory
from visivo.query.jobs.job import Job
from visivo.query.target_job_tracker import TargetJobTracker


class MockFuture:
    def __init__(self, done):
        self.is_done = done

    def done(self):
        return self.is_done


def test_TargetJobTracker_accepting_job():
    target_job_limits = TargetJobTracker()
    target = TargetFactory()
    job = Job(name="name", target=target, action=None)

    target_job_limits.track_job(job)

    assert target_job_limits.is_accepting_job(job)

    job.set_future(MockFuture(False))

    assert not target_job_limits.is_accepting_job(job)

    job.set_future(MockFuture(True))

    assert target_job_limits.is_accepting_job(job)


def test_TargetJobTracker_done():
    target_job_limits = TargetJobTracker()
    target = TargetFactory()
    job = Job(name="name", target=target, action=None)
    target_job_limits.track_job(job)

    assert not target_job_limits.is_job_name_done(job_name=job.name)

    job.set_future(MockFuture(True))

    assert target_job_limits.is_job_name_done(job_name=job.name)


def test_TargetJobTracker_enqueued():
    target_job_limits = TargetJobTracker()
    target = TargetFactory()
    job = Job(name="name", target=target, action=None)
    target_job_limits.track_job(job)

    assert target_job_limits.is_job_name_enqueued(job_name=job.name)

    job.set_future(MockFuture(False))

    assert target_job_limits.is_job_name_enqueued(job_name=job.name)

    job.set_future(MockFuture(True))

    assert target_job_limits.is_job_name_enqueued(job_name=job.name)
