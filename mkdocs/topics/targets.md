# Target Overview

Targets are data sources. They are databases that contain your data. There is specific documentation on how to connect to a variety of databases in the [Configuration documentation](../reference/configuration/targets/sqlitetarget.md), this page describes some best practices how how to set them up. 

# Environments 

An example of a target might be the database that your application runs on.  We recommend that you think of a target in your project by the what it is used for and not by its environment.  

For example lets say you have an application that stores its data in a PostgreSQL database call `app_db` and runs locally, in staging, and in production. This means you have three separate databases, but they all used to run your application, so that is a single `target`.  The following might be how you set that up in your project:

``` yaml
targets:
  - name: domain_target
    database: app_db
    type: postgresql
    username: {% raw %} {{ env_var('APP_DATABASE_USERNAME') }} {% endraw %}
    password: {% raw %} {{ env_var('APP_DATABASE_USERNAME') }} {% endraw %}
```

This structure then allows you to set your username and password per environment to connect to that environment's `app_db`.  The `env_var` use isn't limited to the username and password, your database name or any other property may also be environment specific.  
