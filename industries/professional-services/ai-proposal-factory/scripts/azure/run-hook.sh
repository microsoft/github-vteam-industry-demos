#!/usr/bin/env sh
set -eu

script="${1:-}"
case "$script" in
  preprovision.py|postprovision.py) ;;
  *)
    echo "Expected preprovision.py or postprovision.py." >&2
    exit 2
    ;;
esac

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/../.." && pwd)
venv_path="$repo_root/.venv"
python_path="$venv_path/bin/python"

if [ ! -x "$python_path" ]; then
  python3 -m venv "$venv_path"
fi

"$python_path" -m pip install \
  --disable-pip-version-check \
  --quiet \
  -r "$script_dir/requirements.txt"
"$python_path" "$script_dir/$script"
