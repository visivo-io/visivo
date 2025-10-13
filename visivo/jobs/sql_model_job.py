from visivo.jobs.job import Job
from visivo.models.models.sql_model import SqlModel


def action(sql_model, dag, output_dir):
    pass

def job(dag, output_dir: str, sql_model: SqlModel):
    return Job(
        item=sql_model,
        source=sql_model.source,
        action=action,
        dag=dag,
        output_dir=output_dir,
    )