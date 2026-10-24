import os
import stat
import subprocess
from pathlib import Path

import pytest

INSTALL_SH = Path(__file__).resolve().parents[2] / "install.sh"

CURL_STUB = """#!/bin/bash
out=""
prev=""
for a in "$@"; do
  if [ "$prev" = "-o" ]; then out="$a"; fi
  prev="$a"
done
if [ -n "$out" ]; then
  echo "$@" >> "$STUB_LOG"
  : > "$out"
else
  echo "$@" >> "$STUB_LOG"
  echo "$STUB_RELEASE_JSON"
fi
"""

UNZIP_STUB = """#!/bin/bash
echo "unzip $@" >> "$STUB_LOG"
dest=""
prev=""
for a in "$@"; do
  if [ "$prev" = "-d" ]; then dest="$a"; fi
  prev="$a"
done
printf '#!/bin/bash\\necho "visivo, version 9.9.9"\\n' > "$dest/visivo"
"""


def _stub(path: Path, body: str):
    path.write_text(body)
    path.chmod(path.stat().st_mode | stat.S_IEXEC)


def _run(tmp_path, kernel, machine, arm64_flag, assets):
    bin_dir = tmp_path / "stubs"
    bin_dir.mkdir()
    home = tmp_path / "home"
    home.mkdir()
    _stub(bin_dir / "uname", f'#!/bin/bash\n[ "$1" = "-s" ] && echo {kernel} || echo {machine}\n')
    _stub(bin_dir / "sw_vers", "#!/bin/bash\necho 15.1\n")
    if arm64_flag is None:
        _stub(bin_dir / "sysctl", "#!/bin/bash\nexit 1\n")
    else:
        _stub(bin_dir / "sysctl", f"#!/bin/bash\necho {arm64_flag}\n")
    _stub(bin_dir / "curl", CURL_STUB)
    _stub(bin_dir / "unzip", UNZIP_STUB)
    release = "\n".join(
        f'"browser_download_url": "https://example.test/{name}"' for name in assets
    )
    log = tmp_path / "log"
    env = {
        "PATH": f"{bin_dir}:/usr/bin:/bin",
        "HOME": str(home),
        "SHELL": "/bin/bash",
        "STUB_LOG": str(log),
        "STUB_RELEASE_JSON": release,
    }
    result = subprocess.run(
        ["/bin/bash", str(INSTALL_SH)], env=env, capture_output=True, text=True, timeout=60
    )
    return result, log.read_text() if log.exists() else ""


def test_apple_silicon_uses_arm64_build(tmp_path):
    result, log = _run(tmp_path, "Darwin", "arm64", "1", ["visivo-darwin-arm64.zip"])
    assert result.returncode == 0, result.stderr
    assert "darwin-arm64" in result.stdout
    assert "https://example.test/visivo-darwin-arm64.zip" in log


def test_apple_silicon_under_rosetta_still_uses_arm64_build(tmp_path):
    result, log = _run(tmp_path, "Darwin", "x86_64", "1", ["visivo-darwin-arm64.zip"])
    assert result.returncode == 0, result.stderr
    assert "https://example.test/visivo-darwin-arm64.zip" in log


@pytest.mark.parametrize("flag", [None, "0"])
def test_intel_mac_gets_a_clear_message(tmp_path, flag):
    result, log = _run(tmp_path, "Darwin", "x86_64", flag, ["visivo-darwin-arm64.zip"])
    assert result.returncode == 1
    assert "no build for Intel Macs" in result.stderr
    assert "pip install visivo" in result.stderr
    assert "Could not find the download URL" not in result.stderr
    assert log == ""


def test_unzip_is_quiet_and_version_is_printed(tmp_path):
    result, log = _run(tmp_path, "Linux", "x86_64", None, ["visivo-linux-x86.zip"])
    assert result.returncode == 0, result.stderr
    assert "unzip -q" in log
    assert "Installed Visivo version: visivo, version 9.9.9" in result.stdout


def test_install_writes_only_under_fake_home(tmp_path):
    result, _ = _run(tmp_path, "Linux", "x86_64", None, ["visivo-linux-x86.zip"])
    assert (tmp_path / "home" / ".visivo" / "bin" / "visivo").exists()
