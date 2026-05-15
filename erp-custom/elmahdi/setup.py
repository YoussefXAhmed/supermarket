import re
from pathlib import Path

from setuptools import find_packages, setup

ROOT = Path(__file__).parent


def get_version() -> str:
    init_py = ROOT / "elmahdi" / "__init__.py"
    content = init_py.read_text(encoding="utf-8")
    match = re.search(r'__version__\s*=\s*["\']([^"\']+)["\']', content)
    if not match:
        raise RuntimeError("Cannot find __version__ in elmahdi/__init__.py")
    return match.group(1)


def get_requirements() -> list[str]:
    req_file = ROOT / "requirements.txt"
    if not req_file.exists():
        return []
    return [
        line.strip()
        for line in req_file.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]


setup(
    name="elmahdi",
    version=get_version(),
    description="SPA session identity API for supermarket ERP frontend",
    author="Elmahdi",
    author_email="support@elmahdi.com",
    packages=find_packages(),
    zip_safe=False,
    include_package_data=True,
    install_requires=get_requirements(),
)
