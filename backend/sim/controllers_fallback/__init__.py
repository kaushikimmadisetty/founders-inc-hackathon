"""Hand written controllers per template so the sim gate can always run."""
from pathlib import Path

HERE = Path(__file__).parent


def load_source(template: str) -> str:
    name = {"diff_drive_rover": "diff_drive.py", "mecanum_base": "mecanum.py", "mecanum_arm": "mecanum.py"}[template]
    return (HERE / name).read_text()
