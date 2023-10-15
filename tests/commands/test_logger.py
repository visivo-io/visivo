from visivo.commands.logger import Logger


def test_logger_init():
    logger = Logger(type=Logger.TypeEnum.console)
    logger.info("Hello")
    assert logger.echo is not None
