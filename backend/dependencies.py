"""
依赖管理模块
负责检测、安装、升级 Python 依赖包
"""

import sys
import subprocess
import importlib.util
import threading
import time
from typing import List, Tuple, Optional, Callable
from dataclasses import dataclass
from enum import Enum


class InstallStatus(Enum):
    PENDING = "pending"
    CHECKING = "checking"
    INSTALLING = "installing"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class PackageInfo:
    name: str
    import_name: str
    required_version: str = ""
    status: InstallStatus = InstallStatus.PENDING
    current_version: str = ""
    error: str = ""
    required: bool = True


CORE_PACKAGES: List[PackageInfo] = [
    PackageInfo("fastapi", "fastapi", ">=0.100.0"),
    PackageInfo("uvicorn", "uvicorn", ">=0.23.0"),
    PackageInfo("httpx", "httpx", ">=0.24.0"),
    PackageInfo("cryptography", "cryptography", ">=41.0.0"),
    PackageInfo("Pillow", "PIL", ">=10.0.0"),
    PackageInfo("SQLAlchemy", "sqlalchemy", ">=2.0.0"),
    PackageInfo("pydantic", "pydantic", ">=2.0.0"),
    PackageInfo("boto3", "boto3", required=False),
    PackageInfo("pyinstaller", "PyInstaller", required=False),
    PackageInfo("python-multipart", "multipart", required=False),
]

RUNTIME_SYSTEM_DEPS = {}


def _get_version(import_name: str) -> str:
    try:
        mod = importlib.import_module(import_name)
        return getattr(mod, "__version__", "0.0.0")
    except Exception:
        return ""


def check_all_dependencies() -> List[PackageInfo]:
    results = []
    for pkg in CORE_PACKAGES:
        ver = _get_version(pkg.import_name)
        if ver:
            pkg.status = InstallStatus.SUCCESS
            pkg.current_version = ver
        else:
            pkg.status = InstallStatus.FAILED
        results.append(pkg)
    return results


def get_missing_required() -> List[PackageInfo]:
    return [p for p in CORE_PACKAGES if p.status != InstallStatus.SUCCESS and p.required]


def install_all_missing(
    on_progress: Optional[Callable[[str, int], None]] = None,
    on_complete: Optional[Callable[[bool, str], None]] = None,
) -> threading.Thread:
    to_install = [p for p in CORE_PACKAGES if p.status != InstallStatus.SUCCESS]

    def _install():
        total = len(to_install)
        for i, pkg in enumerate(to_install):
            if on_progress:
                on_progress(f"正在安装 {pkg.name}...", int((i / total) * 100))
            try:
                subprocess.check_call(
                    [sys.executable, "-m", "pip", "install", pkg.name],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                pkg.status = InstallStatus.SUCCESS
                pkg.current_version = _get_version(pkg.import_name)
            except subprocess.CalledProcessError as e:
                pkg.status = InstallStatus.FAILED
                pkg.error = str(e)
        if on_progress:
            on_progress("安装检查完成", 100)
        any_failed = any(p.status == InstallStatus.FAILED for p in to_install)
        if on_complete:
            on_complete(not any_failed, "部分包安装失败" if any_failed else "全部成功")

    t = threading.Thread(target=_install, daemon=True)
    t.start()
    return t


def format_report(results: Optional[List[PackageInfo]] = None) -> str:
    if results is None:
        results = CORE_PACKAGES
    lines = []
    for pkg in results:
        icon = "OK" if pkg.status == InstallStatus.SUCCESS else "MISS"
        ver = pkg.current_version or "未安装"
        lines.append(f" [{icon}] {pkg.name}: {ver}")
    return "\n".join(lines)


def check_python_version() -> Tuple[bool, str]:
    v = sys.version_info
    if v >= (3, 10):
        return True, f"Python {v.major}.{v.minor}.{v.micro}"
    return False, f"Python 版本过低: {v.major}.{v.minor}.{v.micro}，需要 >= 3.10"


def run_full_check() -> Tuple[bool, List[PackageInfo]]:
    py_ok, py_msg = check_python_version()
    if not py_ok:
        return False, []
    pkgs = check_all_dependencies()
    return all(p.status == InstallStatus.SUCCESS for p in pkgs), pkgs
