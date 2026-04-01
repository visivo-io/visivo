FROM python:3.12-slim

RUN pip install --no-cache-dir 'fakesnow[server]'

EXPOSE 12345

CMD ["fakesnow", "-s", "-p", "12345", "--host", "0.0.0.0"]
