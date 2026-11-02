#!/usr/bin/env bash
# Prints comparable machine and pytest timings. Same script on Actions and RWX.
set -uo pipefail
lscpu | grep -E "Model name|^CPU\(s\)|Thread|Core|MHz|Hypervisor|L2|L3" | sed "s/^/PROBE /"
free -m | head -2 | sed "s/^/PROBE /"
df -h . | tail -1 | sed "s/^/PROBE /"
PY=$(poetry run which python); echo "PROBE python $PY"
$PY - <<'P'
import sys, sysconfig, time, multiprocessing as mp, os, tempfile
print("PROBE version", sys.version)
print("PROBE config", sysconfig.get_config_var("CONFIG_ARGS"))
print("PROBE cflags", sysconfig.get_config_var("PY_CFLAGS"))
def work(_=0):
    t=time.perf_counter(); s=0
    for i in range(20_000_000): s+=i*i%7
    return time.perf_counter()-t
print("PROBE cpu1_s", round(work(),2))
with mp.get_context('fork').Pool(4) as p: print("PROBE cpu4x_s", [round(x,2) for x in p.map(work, range(4))])
t=time.perf_counter()
with tempfile.TemporaryDirectory(dir=".") as d:
    for i in range(5000):
        with open(os.path.join(d,str(i)),"w") as f: f.write("x"*1024)
print("PROBE smallfile_s", round(time.perf_counter()-t,2))
t=time.perf_counter()
n=0
for r,_,fs in os.walk(".venv" if os.path.isdir(".venv") else sys.prefix):
    for f in fs:
        n+=1
        try: open(os.path.join(r,f),"rb").read(4096)
        except OSError: pass
print("PROBE walk_read_s", round(time.perf_counter()-t,2), n)
t=time.perf_counter(); import pandas, sqlglot, pydantic; print("PROBE imports_s", round(time.perf_counter()-t,2))
P
run() { local name=$1; shift; local s=$(date +%s); "$@" >/tmp/probe_$name.log 2>&1; local rc=$?; echo "PROBE pytest_$name rc=$rc s=$(( $(date +%s)-s ))"; tail -1 /tmp/probe_$name.log; }
poetry install --with dev >/dev/null 2>&1
run nocov poetry run pytest -q --durations=25
grep -A28 "slowest 25" /tmp/probe_nocov.log | sed 's/^/PROBE slow /' | head -28
run cov poetry run pytest -q --cov=visivo --cov-report=
COVERAGE_CORE=sysmon run sysmon poetry run pytest -q --cov=visivo --cov-report=
tail -2 /tmp/probe_sysmon.log | sed 's/^/PROBE sysmon /'
