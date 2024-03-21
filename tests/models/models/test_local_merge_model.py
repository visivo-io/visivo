import os
import click
import pytest
from tests.support.utils import temp_folder
from tests.factories.model_factories import LocalMergeModelFactory
from pydantic import ValidationError
from visivo.models.models.local_merge_model import LocalMergeModel


def test_LocalMergeModel_simple_data():
    data = {"name": "model", "models": ["ref(other_model)"]}
    model = LocalMergeModel(**data)
    assert model.name == "model"


def test_LocalMergeModel_insert_data():
    model = LocalMergeModelFactory()
    output_dir = temp_folder()
    os.makedirs(output_dir, exist_ok=True)
    model.insert_dependent_models_to_sqlite(output_dir)
    assert model.name == "model"
