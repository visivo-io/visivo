from uuid import uuid4
from threading import Lock

background_jobs = {}
background_jobs_lock = Lock()
