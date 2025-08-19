from time import time

compile_import_start = time()
from visivo.logger.logger import Logger

Logger.instance().debug("Compiling project...")
import json

from visivo.parsers.serializer import Serializer
from visivo.commands.parse_project_phase import parse_project_phase
from visivo.validation.metric_validator import MetricValidator

import_duration = round(time() - compile_import_start, 2)
Logger.instance().debug(f"Compile Import completed in {import_duration}s")


def _collect_compile_telemetry(project):
    """Collect telemetry metrics during compile phase."""
    try:
        from visivo.telemetry.command_tracker import track_compile_metrics

        track_compile_metrics(project)
    except Exception:
        # Silently ignore any telemetry errors
        pass


def _validate_metrics_and_relations(project):
    """Validate all metrics and relations in the project using SQLGlot."""
    validation_errors = []
    
    # Validate global metrics
    if hasattr(project, 'metrics') and project.metrics:
        for metric in project.metrics:
            is_valid, error = MetricValidator.validate_aggregate_expression(metric.expression)
            if not is_valid:
                validation_errors.append(f"Invalid metric '{metric.name}': {error}")
    
    # Validate model-level metrics and dimensions  
    if hasattr(project, 'models') and project.models:
        for model in project.models:
            # Validate model metrics
            if hasattr(model, 'metrics') and model.metrics:
                for metric in model.metrics:
                    is_valid, error = MetricValidator.validate_aggregate_expression(metric.expression)
                    if not is_valid:
                        validation_errors.append(f"Invalid metric '{metric.name}' in model '{model.name}': {error}")
            
            # Validate model dimensions
            if hasattr(model, 'dimensions') and model.dimensions:
                for dimension in model.dimensions:
                    is_valid, error = MetricValidator.validate_dimension_expression(dimension.expression)
                    if not is_valid:
                        validation_errors.append(f"Invalid dimension '{dimension.name}' in model '{model.name}': {error}")
    
    # Validate project-level dimensions
    if hasattr(project, 'dimensions') and project.dimensions:
        for dimension in project.dimensions:
            is_valid, error = MetricValidator.validate_dimension_expression(dimension.expression)
            if not is_valid:
                validation_errors.append(f"Invalid dimension '{dimension.name}': {error}")
    
    # Validate relations
    if hasattr(project, 'relations') and project.relations:
        for relation in project.relations:
            is_valid, error = MetricValidator.validate_join_condition(
                relation.condition, 
                relation.left_model, 
                relation.right_model
            )
            if not is_valid:
                validation_errors.append(f"Invalid relation '{relation.name}': {error}")
    
    return validation_errors


def compile_phase(
    default_source: str,
    working_dir: str,
    output_dir: str,
    dbt_profile: str = None,
    dbt_target: str = None,
):
    # Track parse project
    parse_start = time()
    Logger.instance().debug("    Running parse project phase...")
    project = parse_project_phase(working_dir, output_dir, default_source, dbt_profile, dbt_target)
    parse_duration = round(time() - parse_start, 2)
    Logger.instance().debug(f"Project parsing completed in {parse_duration}s")

    # Validate metrics and relations using SQLGlot
    validation_start = time()
    Logger.instance().debug("    Validating metrics and relations...")
    validation_errors = _validate_metrics_and_relations(project)
    validation_duration = round(time() - validation_start, 2)
    Logger.instance().debug(f"Validation completed in {validation_duration}s")
    
    if validation_errors:
        error_message = "Compilation failed due to validation errors:\n" + "\n".join(validation_errors)
        Logger.instance().error(error_message)
        
        # Write validation errors to error.json
        with open(f"{output_dir}/error.json", "w") as error_file:
            error_file.write(json.dumps({"errors": validation_errors}))
        
        raise ValueError(error_message)

    # Collect project metrics for telemetry
    _collect_compile_telemetry(project)

    # Track artifacts writing
    artifacts_start = time()
    Logger.instance().debug("    Writing artifacts...")

    # Write the original project.json
    with open(f"{output_dir}/project.json", "w") as fp:
        serializer = Serializer(project=project)
        fp.write(serializer.dereference().model_dump_json(exclude_none=True))

    # Write the flattened explorer.json for the QueryExplorer
    with open(f"{output_dir}/explorer.json", "w") as fp:
        serializer = Serializer(project=project)
        explorer_data = serializer.create_flattened_project()
        json.dump(explorer_data, fp)
    artifacts_duration = round(time() - artifacts_start, 2)
    Logger.instance().debug(f"Project artifacts written in {artifacts_duration}s")

    total_duration = round(time() - parse_start, 2)

    with open(f"{output_dir}/error.json", "w") as error_file:
        error_file.write(json.dumps({}))

    Logger.instance().success(
        f"Compile completed in {total_duration}s "
        f"imports: {import_duration}s, "
        f"parse: {parse_duration}s, "
        f"validation: {validation_duration}s, "
        f"artifacts: {artifacts_duration}s, "
    )

    return project
