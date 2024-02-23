from visivo.logging.logger import Logger
from visivo.models.base.parent_model import ParentModel
from visivo.models.model import CsvScriptModel, Model
from visivo.models.target import Target
from visivo.query.runner import Runner, format_message
from time import time


def action(trace, dag, output_dir, errors):
    model = ParentModel.all_descendants_of_type(
        type=Model, dag=dag, from_node=trace
    )[0]
    if isinstance(model, CsvScriptModel):
        target = model.get_target(output_dir=output_dir)
    else:
        target = ParentModel.all_descendants_of_type(
            type=Target, dag=dag, from_node=model
        )[0]

    trace_directory = f"{output_dir}/{trace.name}"
    trace_query_file = f"{trace_directory}/query.sql"
    with open(trace_query_file, "r") as file:
        query_string = file.read()
        try:
            start_message = format_message(
                details=f"Running trace \033[4m{trace.name}\033[0m",
                status="RUNNING",
                full_path=trace_query_file,
            )
            Logger.instance().info(start_message)
            start_time = time()
            data_frame = target.read_sql(query_string)
            success_message = format_message(
                details=f"Updated data for trace \033[4m{trace.name}\033[0m",
                status=f"\033[32mSUCCESS\033[0m {round(time()-start_time,2)}s",
                full_path=trace_query_file,
            )
            Runner.aggregate_data_frame(data_frame=data_frame, trace_dir=trace_directory)
            Logger.instance().success(success_message)
        except Exception as e:
            failure_message = format_message(
                details=f"Failed query for trace \033[4m{trace.name}\033[0m",
                status=f"\033[31mFAILURE\033[0m {round(time()-start_time,2)}s",
                full_path=trace_query_file,
                error_msg=str(repr(e)),
            )
            Logger.instance().error(str(failure_message))
            errors.append(f"\033[4m{trace.name}\033[0m: {str(repr(e))}")
