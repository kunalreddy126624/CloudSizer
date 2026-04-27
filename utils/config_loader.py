from pathlib import Path

try:
    import yaml
except ImportError as exc:
    yaml = None
    _yaml_import_error = exc
else:
    _yaml_import_error = None


def load_config(path: str = "config.yaml"):
    if yaml is None:
        raise RuntimeError("PyYAML is required to load config.yaml. Install dependencies from requirements.txt first.") from _yaml_import_error
    config_path = Path(path)
    with config_path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)
