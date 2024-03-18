from visivo.models.targets.sqlalchemy_target import SqlalchemyTarget
from visivo.models.targets.target import Target, TypeEnum


class MysqlTarget(SqlalchemyTarget):
    """
    SqliteTargets hold the connection information to SQLite data sources.

    A single project can have many targets. You can even set up Visivo so that a single chart contains traces that pull data from completely different targets. ex.)
    ``` yaml
    targets:
      - name: local-sqlite
        database: target/local.db
        type: sqlite
    ```

    It is best practice to leverage the `{% raw %}{{ env_var() }}{% endraw %}` jinja function for storing secrets and enabling different permissions in production, staging and dev.
    """

    type: TypeEnum.mysql

    def get_dialect(self):
        return "mysql"
