import sys
from visivo.logger.logger import Logger
from visivo.models.test import Test
from visivo.testing.runner import Runner
from visivo.commands.compile_phase import compile_phase


def test_phase(
    output_dir: str,
    default_source: str,
    working_dir: str,
    no_deprecation_warnings: bool = False,
    defer_exit: bool = False,
):
    """
    ``defer_exit`` skips the ``sys.exit(1)`` on a failing assertion so the caller
    can report the failures and pick the exit code, which ``visivo test --json``
    needs in order to print its envelope first. Returns ``(project, test_run)``.
    """
    project = compile_phase(
        default_source=default_source,
        working_dir=working_dir,
        output_dir=output_dir,
        no_deprecation_warnings=no_deprecation_warnings,
    )
    Logger.instance().debug("Testing project")

    dag = project.dag()
    tests = project.descendants_of_type(type=Test)

    test_runner = Runner(
        tests=tests,
        project=project,
        output_dir=output_dir,
        dag=dag,
    )
    test_run = test_runner.run()
    if not test_run.success and not defer_exit:
        sys.exit(1)
    return project, test_run


test_phase.__test__ = False
