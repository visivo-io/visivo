from visivo.parsers.core_parser import CoreParser


# This gives us a place to call different Parsers depending on project type
#
# Basic use case:
# parser = ParserFactory(project_file=project_file, files=files).build()
# project = parser.build()
class ParserFactory:
    def build(self, project_file, files):
        return CoreParser(project_file=project_file, files=files)
