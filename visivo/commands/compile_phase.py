from time import time

compile_import_start = time()
from visivo.logger.logger import Logger

Logger.instance().debug("Compiling project...")
import json

from visivo.parsers.serializer import Serializer
from visivo.commands.parse_project_phase import parse_project_phase
from visivo.validation.metric_validator import MetricValidator
from visivo.query.metric_resolver import MetricResolver

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


def _resolve_and_validate_metrics(project):
    """Resolve and validate all metrics in the project."""
    validation_errors = []

    # Initialize metric resolver
    try:
        resolver = MetricResolver(project)
    except Exception as e:
        Logger.instance().debug(f"MetricResolver initialization failed: {e}")
        resolver = None

    # Resolve and validate global metrics
    if hasattr(project, "metrics") and project.metrics:
        for metric in project.metrics:
            # Try to resolve metric references first
            resolved_expression = metric.expression
            involved_models = []

            if resolver and "${ref(" in metric.expression:
                try:
                    # Resolve all metric references to pure SQL
                    resolved_expression, involved_models = resolver.resolve_metric_for_validation(
                        metric.name
                    )
                    Logger.instance().debug(
                        f"Resolved metric '{metric.name}': {resolved_expression}"
                    )
                    Logger.instance().debug(f"Models involved: {involved_models}")
                except Exception as e:
                    validation_errors.append(f"Failed to resolve metric '{metric.name}': {str(e)}")
                    continue

            # Validate the resolved expression
            is_valid, error = MetricValidator.validate_aggregate_expression(resolved_expression)
            if not is_valid:
                validation_errors.append(f"Invalid metric '{metric.name}': {error}")

            # Store metadata for later use
            metric._resolved_expression = resolved_expression
            metric._involved_models = involved_models

    # Resolve and validate model-level metrics
    if hasattr(project, "models") and project.models:
        for model in project.models:
            if hasattr(model, "metrics") and model.metrics:
                for metric in model.metrics:
                    # Try to resolve metric references first
                    resolved_expression = metric.expression
                    involved_models = [model.name]  # Model metrics start with their own model

                    if resolver and "${ref(" in metric.expression:
                        try:
                            # Resolve references within model metric
                            full_name = f"{model.name}.{metric.name}"
                            resolved_expression, involved_models = (
                                resolver.resolve_metric_for_validation(full_name)
                            )
                            Logger.instance().debug(
                                f"Resolved model metric '{full_name}': {resolved_expression}"
                            )
                        except Exception as e:
                            validation_errors.append(
                                f"Failed to resolve metric '{metric.name}' in model '{model.name}': {str(e)}"
                            )
                            continue

                    # Validate the resolved expression
                    is_valid, error = MetricValidator.validate_aggregate_expression(
                        resolved_expression
                    )
                    if not is_valid:
                        validation_errors.append(
                            f"Invalid metric '{metric.name}' in model '{model.name}': {error}"
                        )

                    # Store metadata
                    metric._resolved_expression = resolved_expression
                    metric._involved_models = involved_models

            # Validate model dimensions
            if hasattr(model, "dimensions") and model.dimensions:
                for dimension in model.dimensions:
                    is_valid, error = MetricValidator.validate_dimension_expression(
                        dimension.expression
                    )
                    if not is_valid:
                        validation_errors.append(
                            f"Invalid dimension '{dimension.name}' in model '{model.name}': {error}"
                        )

    # Validate project-level dimensions
    if hasattr(project, "dimensions") and project.dimensions:
        for dimension in project.dimensions:
            is_valid, error = MetricValidator.validate_dimension_expression(dimension.expression)
            if not is_valid:
                validation_errors.append(f"Invalid dimension '{dimension.name}': {error}")

    # Validate relations
    if hasattr(project, "relations") and project.relations:
        for relation in project.relations:
            # Extract models from the condition
            models = relation.get_referenced_models()

            if len(models) < 2:
                validation_errors.append(
                    f"Invalid relation '{relation.name}': condition must reference at least two models"
                )
                continue

            # Check that all referenced entities are actually models (not sources, traces, etc.)
            for model_ref in models:
                # Check if it's a model in the project
                is_model = False
                if hasattr(project, "models") and project.models:
                    for model in project.models:
                        if model.name == model_ref:
                            is_model = True
                            break

                if not is_model:
                    validation_errors.append(
                        f"Invalid relation '{relation.name}': '{model_ref}' is not a valid model. "
                        f"Relations can only reference models, not sources, traces, or other objects."
                    )
                    continue

            # Validate that the condition doesn't reference metrics
            if resolver:
                # Check if any referenced fields are metrics
                import re

                pattern = r"\$\{ref\(([^)]+)\)\.([^}]+)\}"
                for match in re.finditer(pattern, relation.condition):
                    model_name = match.group(1)
                    field_name = match.group(2)

                    # Check if this field is a metric
                    metric_full_name = f"{model_name}.{field_name}"
                    if resolver.find_metric(metric_full_name):
                        validation_errors.append(
                            f"Invalid relation '{relation.name}': cannot join on metric '{field_name}'. "
                            f"Metrics are aggregate values and cannot be used in join conditions."
                        )

            # Validate the SQL syntax of the condition
            # Convert condition to use the first two models found for validation
            model_list = list(models)
            is_valid, error = MetricValidator.validate_join_condition(
                relation.condition,
                model_list[0] if len(model_list) > 0 else "",
                model_list[1] if len(model_list) > 1 else "",
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

    # Resolve and validate metrics and relations
    validation_start = time()
    Logger.instance().debug("    Resolving and validating metrics...")
    validation_errors = _resolve_and_validate_metrics(project)
    validation_duration = round(time() - validation_start, 2)
    Logger.instance().debug(f"Resolution and validation completed in {validation_duration}s")

    if validation_errors:
        error_message = "Compilation failed due to validation errors:\n" + "\n".join(
            validation_errors
        )
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
