import pydantic
from datetime import datetime
from typing import List, Optional


class TestResult(pydantic.BaseModel):
    test_id: str

    __test__ = False


class TestSuccess(TestResult):
    pass

    __test__ = False


class TestFailure(TestResult):
    message: str

    __test__ = False


class TestRun(pydantic.BaseModel):
    started_at: datetime = datetime.now()
    finished_at: Optional[datetime] = None
    failures: List[TestFailure] = []
    successes: List[TestSuccess] = []

    @property
    def success(self):
        return len(self.failures) == 0

    def add_failure(self, failure: TestFailure):
        self.failures.append(failure)

    def add_success(self, success: TestSuccess):
        self.successes.append(success)

    def count(self):
        return len(self.failures) + len(self.successes)

    def duration(self):
        return (self.finished_at - self.started_at).seconds

    def summary(self):
        summary = f"Testing complete. {self.count()} tests run in {self.duration()} seconds."
        if self.failures:
            summary += "\nFailures:"
        for failure in self.failures:
            summary += f"\n> {failure.test_id}: {failure.message}"
        return summary

    __test__ = False
