FROM python:3.12-slim

# snowflake-connector-python is held below 5 because fakesnow 0.11.x imports
# `snowflake.connector.converter`, which 5.0.0 removed — so an unpinned build
# installs a fake that cannot start:
#
#   File "fakesnow/cursor.py", line 16, in <module>
#     import snowflake.connector.converter
#   ModuleNotFoundError: No module named 'snowflake.connector.converter'
#
# Nothing in this image was pinned, so it resolved fresh on every build and
# broke the day 5.0.0 shipped. Below 5 is also the version visivo's own lock
# installs (4.4.0), which is what this is meant to be a fake of.
RUN pip install --no-cache-dir 'fakesnow[server]' 'snowflake-connector-python<5'

EXPOSE 12345

CMD ["fakesnow", "-s", "-p", "12345", "--host", "0.0.0.0"]
