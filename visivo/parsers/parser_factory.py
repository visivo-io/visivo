from .core_parser import CoreParser


# This gives us a place to call different Parsers depending on project type
#
# Basic use case:
# parser = ParserFactory(files=files).build()
# project = parser.build()
class ParserFactory:
    def build(self, files):
        return CoreParser(files=files)
