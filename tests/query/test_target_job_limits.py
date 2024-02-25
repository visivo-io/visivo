from tests.factories.model_factories import TargetFactory, TraceFactory
from visivo.query.jobs.job import Job
from visivo.query.target_job_limits import TargetJobLimits


class MockFuture:
    def __init__(self, done):
        self.is_done = done

    def done(self):
        return self.is_done


def test_TargetJobLimits_accepting_job_not_done():
    target_job_limits = TargetJobLimits()
    target = TargetFactory()
    job = Job(name="name", target=target, action=None)
    job.set_future(MockFuture(False))

    assert target_job_limits.accepting_job(job)

    target_job_limits.track_job(job)

    assert not target_job_limits.accepting_job(job)


def test_TargetJobLimits_accepting_job_done():
    target_job_limits = TargetJobLimits()
    target = TargetFactory()
    job = Job(name="name", target=target, action=None)
    job.set_future(MockFuture(True))

    assert target_job_limits.accepting_job(job)

    target_job_limits.track_job(job)

    assert target_job_limits.accepting_job(job)
