from visivo.logger.logger import Logger, TypeEnum


def test_logger_init():
    logger = Logger.instance()
    logger.info("Hello")
    assert logger.echo is not None
