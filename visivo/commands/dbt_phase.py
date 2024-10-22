def dbt_phase(working_dir):
    from .utils import parse_project_file

    project = parse_project_file(working_dir)
