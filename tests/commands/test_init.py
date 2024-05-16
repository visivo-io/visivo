import os
from pathlib import Path
from visivo.commands.init import init
from tests.support.utils import temp_folder
from click.testing import CliRunner

runner = CliRunner()


def test_init_with_sqlite():
    tmp = temp_folder()

    response = runner.invoke(init, input=f"{tmp}\nsqlite\ntoken\n")
    assert f"Created project in '{tmp}'" in response.output
    assert response.exit_code == 0
    assert Path(f"{tmp}/.env").read_text() == "DB_PASSWORD=EXAMPLE_password_l0cation"
    assert Path(f"{tmp}/.gitignore").read_text() == ".env\ntarget\n.visivo_cache"
    assert os.path.exists(f"{tmp}/project.visivo.yml")
    assert os.path.exists(f"{tmp}/local.db")


def test_init_with_postgres():
    tmp = temp_folder()

    response = runner.invoke(
        init,
        input=f"{tmp}\n"
        + "postgresql\n"
        + "host\n"
        + "database\n"
        + "username\n"
        + "password\n"
        + "password\n"
        + "token\n",
    )
    assert f"Created project in '{tmp}'" in response.output
    assert response.exit_code == 0
    assert Path(f"{tmp}/.env").read_text() == "DB_PASSWORD=password"
    assert Path(f"{tmp}/.gitignore").read_text() == ".env\ntarget\n.visivo_cache"
    assert os.path.exists(f"{tmp}/project.visivo.yml")
    assert "username" in Path(f"{tmp}/project.visivo.yml").read_text()
    assert (
        "{{ env_var('DB_PASSWORD') }}" in Path(f"{tmp}/project.visivo.yml").read_text()
    )


def test_init_with_snowflake():
    tmp = temp_folder()

    response = runner.invoke(
        init,
        input=f"{tmp}\n"
        + "snowflake\n"
        + "host\n"
        + "database\n"
        + "username\n"
        + "account\n"
        + "warehouse\n"
        + "password\n"
        + "password\n"
        + "token\n",
    )
    assert f"Created project in '{tmp}'" in response.output
    assert response.exit_code == 0
    assert Path(f"{tmp}/.env").read_text() == "DB_PASSWORD=password"
    assert Path(f"{tmp}/.gitignore").read_text() == ".env\ntarget\n.visivo_cache"
    assert os.path.exists(f"{tmp}/project.visivo.yml")
    assert "username" in Path(f"{tmp}/project.visivo.yml").read_text()
    assert "warehouse" in Path(f"{tmp}/project.visivo.yml").read_text()
    assert (
        "{{ env_var('DB_PASSWORD') }}" in Path(f"{tmp}/project.visivo.yml").read_text()
    )
