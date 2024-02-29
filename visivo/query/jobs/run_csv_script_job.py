from visivo.models.model import CsvScriptModel


def action(csv_script_model: CsvScriptModel, output_dir):
    csv_script_model.insert_csv_to_sqlite(output_dir=output_dir)