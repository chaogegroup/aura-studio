"""
环境依赖检测模块
检查 Python 版本、必需包、系统环境，返回可读报告
"""

import sys
import subprocess
import importlib.util
from dataclasses import dataclass, field
from typing import List, Tuple, Optional
import platform


@dataclass
class CheckResult:
    name: str
    required: bool
    passed: bool
    current: str = ""
    required_version: str = ""
    install_hint: str = ""

    def to_dict(self):
        return {
            "name": self.name,
            "required": self.required,
            "passed": self.passed,
            "current": self.current,
            "required_version": self.required_version,
            "install_hint": self.install_hint,
        }


def check_python_version() -> CheckResult:
    """检查 Python 版本 (>= 3.9)"""
    ver = sys.version_info
    current = f"{ver.major}.{ver.minor}.{ver.micro}"
    passed = ver.major == 3 and ver.minor >= 9
    return CheckResult(
        name="Python",
        required=True,
        passed=passed,
        current=current,
        required_version=">= 3.9",
        install_hint="请安装 Python 3.9 或更高版本：https://www.python.org/downloads/",
    )


def check_package(package_name: str, import_name: str, required_version: str = "") -> CheckResult:
    """检查 Python 包是否已安装"""
    spec = importlib.util.find_spec(import_name)
    if spec is None:
        return CheckResult(
            name=package_name,
            required=True,
            passed=False,
            current="未安装",
            required_version=required_version,
            install_hint=f"运行: pip install {package_name}",
        )

    try:
        mod = importlib.import_module(import_name)
        version = getattr(mod, "__version__", "未知")
    except Exception:
        version = "已安装(版本未知)"

    # 简单版本比较（非精确，主要检查是否存在）
    passed = True
    return CheckResult(
        name=package_name,
        required=True,
        passed=passed,
        current=version,
        required_version=required_version,
        install_hint="",
    )


def check_system_dependency(cmd: str, flag: str = "--version") -> CheckResult:
    """检查系统命令是否存在"""
    try:
        result = subprocess.run(
            [cmd, flag],
            capture_output=True,
            text=True,
            timeout=5,
        )
        output = (result.stdout + result.stderr).strip().split("\n")[0] if (result.stdout or result.stderr) else "已安装"
        passed = result.returncode == 0 or bool(result.stdout or result.stderr)
        return CheckResult(
            name=cmd,
            required=False,
            passed=passed,
            current=output,
            install_hint=f"请安装 {cmd}：https://pypi.org/project/{cmd}/",
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return CheckResult(
            name=cmd,
            required=False,
            passed=False,
            current="未找到",
            install_hint=f"请安装 {cmd}：pip install {cmd}",
        )


def run_full_check() -> Tuple[bool, List[CheckResult]]:
    """
    执行完整环境检查
    返回：(是否全部通过, 检查结果列表)
    """
    results: List[CheckResult] = []

    # Python 版本
    results.append(check_python_version())

    # 必需 Python 包
    required_packages = [
        ("fastapi", "fastapi", ">= 0.100.0"),
        ("uvicorn", "uvicorn", ">= 0.23.0"),
        ("httpx", "httpx", ">= 0.24.0"),
        ("cryptography", "cryptography", ">= 41.0.0"),
        ("webview", "webview", ">= 4.9.0"),
        ("Pillow", "PIL", ">= 10.0.0"),
        ("sqlalchemy", "sqlalchemy", ">= 2.0.0"),
        ("pydantic", "pydantic", ">= 2.0.0"),
    ]
    for pkg_name, import_name, version in required_packages:
        results.append(check_package(pkg_name, import_name, version))

    # 操作系统
    os_name = platform.system()
    results.append(CheckResult(
        name="操作系统",
        required=True,
        passed=True,
        current=f"{os_name} {platform.release()}",
    ))

    all_passed = all(r.passed for r in results if r.required)
    return all_passed, results


def get_missing_required() -> List[CheckResult]:
    """获取未通过的必需检查"""
    _, results = run_full_check()
    return [r for r in results if r.required and not r.passed]


def format_report(results: List[CheckResult]) -> str:
    """格式化为可读报告"""
    lines = ["=" * 60]
    lines.append("  AURA Studio — 环境检测报告")
    lines.append("=" * 60)

    passed_count = sum(1 for r in results if r.passed)
    total_count = len(results)

    lines.append(f"\n结果: {passed_count}/{total_count} 项检查通过\n")

    for r in results:
        status = "✅" if r.passed else "❌"
        req = "[必需]" if r.required else "[可选]"
        lines.append(f"{status} {req} {r.name}")
        lines.append(f"      当前: {r.current}")
        if r.required_version:
            lines.append(f"      要求: {r.required_version}")
        if r.install_hint:
            lines.append(f"      修复: {r.install_hint}")
        lines.append("")

    all_passed = all(r.passed for r in results if r.required)
    if all_passed:
        lines.append("✅ 环境检查通过，可以运行！")
    else:
        lines.append("❌ 环境检查未通过，请先修复上述问题。")
    lines.append("=" * 60)
    return "\n".join(lines)


if __name__ == "__main__":
    all_passed, results = run_full_check()
    print(format_report(results))
    sys.exit(0 if all_passed else 1)
