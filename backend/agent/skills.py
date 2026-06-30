"""
Skills 技能系统
基于 CowAgent Skills (MIT License, Copyright 2022 zhayujie)
适配 AURA Studio 的创作场景

支持两种技能格式（新旧兼容）：
- 旧格式 skill.json：纯 prompt 注入（向后兼容）
- 新格式 SKILL.md：frontmatter 元数据 + Markdown 指令 + 可选 scripts/（可执行技能）

技能结构（新格式）：
- skills/<name>/SKILL.md: 技能定义（YAML frontmatter + Markdown 指令）
- skills/<name>/scripts/: 可执行脚本（模型可调 bash 运行）
- skills/<name>/references/: 参考文档（按需读取）
- skills/<name>/assets/: 资产文件
"""

import json
import os
import re
import logging
from pathlib import Path
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field

logger = logging.getLogger("aura-skills")


# ============ 数据类 ============

@dataclass
class Skill:
    """旧格式技能（skill.json）"""
    name: str
    description: str
    prompt: str
    tools: List[Dict] = field(default_factory=list)
    category: str = "general"

    def to_dict(self) -> Dict:
        return {
            "name": self.name,
            "description": self.description,
            "prompt": self.prompt,
            "tools": self.tools,
            "category": self.category,
            "source": "legacy",
        }

    @classmethod
    def from_dict(cls, data: Dict) -> 'Skill':
        return cls(
            name=data.get("name", ""),
            description=data.get("description", ""),
            prompt=data.get("prompt", ""),
            tools=data.get("tools", []),
            category=data.get("category", "general"),
        )


@dataclass
class SkillMd:
    """新格式技能（SKILL.md）—— 可执行技能"""
    name: str
    description: str
    file_path: str
    base_dir: str          # 技能所在目录（scripts/ 等资源的根）
    content: str           # SKILL.md 完整内容
    frontmatter: Dict[str, Any] = field(default_factory=dict)
    source: str = "markdown"  # builtin / custom / markdown

    def to_dict(self) -> Dict:
        return {
            "name": self.name,
            "description": self.description,
            "file_path": self.file_path,
            "base_dir": self.base_dir,
            "category": self.frontmatter.get("category", "skill"),
            "source": self.source,
            "has_scripts": (Path(self.base_dir) / "scripts").is_dir(),
        }


# ============ frontmatter 解析（移植自 CowAgent skills/frontmatter.py） ============

def parse_frontmatter(content: str) -> Dict[str, Any]:
    """解析 Markdown 开头的 YAML frontmatter（--- 包裹）。

    轻量实现：不引入 PyYAML 依赖，只解析扁平的 key: value 和简单的嵌套。
    覆盖 SKILL.md 常见字段（name/description/metadata.requires 等）。
    """
    if not content.startswith("---"):
        return {}
    end = content.find("\n---", 3)
    if end == -1:
        return {}
    yaml_block = content[3:end].strip()
    result: Dict[str, Any] = {}
    current_key = None
    current_list: Optional[List[str]] = None
    for line in yaml_block.split("\n"):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        # 缩进的列表项（属于上一个 key）
        if line.startswith("  - ") and current_key is not None:
            val = stripped.lstrip("- ").strip()
            if isinstance(result.get(current_key), list):
                result[current_key].append(val)
            elif current_list is not None:
                current_list.append(val)
            continue
        # 缩进的 key: value（嵌套，如 metadata.requires.bins）
        if line.startswith("  ") and ":" in stripped:
            # 简单记录嵌套，不深度解析
            continue
        # 顶层 key: value
        if ":" in stripped:
            k, _, v = stripped.partition(":")
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            current_key = k
            current_list = None
            if v == "":
                # 可能是多行值（列表或嵌套），先占位
                result[k] = []
                current_list = result[k]
            else:
                result[k] = v
                current_list = None
    return result


def _escape_xml(text: str) -> str:
    """转义 XML 特殊字符（移植自 CowAgent skills/formatter.py）。"""
    if not text:
        return ""
    return (text
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
            .replace('"', '&quot;')
            .replace("'", '&apos;'))


# ============ 技能管理器 ============

class SkillManager:
    """
    技能管理器（新旧格式兼容）

    加载来源：
    - 内置技能（BUILTIN_SKILLS，代码中定义的旧格式）
    - 自定义旧格式技能（workspace/skills/<name>/skill.json）
    - 自定义新格式技能（workspace/skills/<name>/SKILL.md 或扫描目录下的）
    """

    # 内置技能（旧格式，保持兼容）
    BUILTIN_SKILLS = [
        Skill(
            name="storyboard",
            description="剧本分镜生成 - 将剧本拆解为分镜头脚本",
            prompt="""你是一个专业的分镜师。根据用户提供的剧本，将其拆解为分镜头脚本。

每个分镜包含：
- 镜号
- 景别（远景/全景/中景/近景/特写）
- 画面描述
- 台词/旁白
- 时长建议

输出格式为 JSON 数组。""",
            category="creation"
        ),
        Skill(
            name="character_design",
            description="角色设计 - 生成角色概念图",
            prompt="""你是一个专业的角色设计师。根据用户描述的角色信息，生成高质量的角色设计图。

要求：
- 全身或半身像
- 背景简洁
- 突出角色特征
- 人物比例协调""",
            category="creation"
        ),
        Skill(
            name="scene_concept",
            description="场景概念 - 生成场景概念图",
            prompt="""你是一个专业的场景概念设计师。根据用户描述的场景信息，生成高质量的场景概念图。

要求：
- 注意光影和氛围
- 构图讲究
- 细节丰富
- 具有电影感""",
            category="creation"
        ),
        Skill(
            name="video_storyboard",
            description="视频分镜 - 生成视频分镜脚本",
            prompt="""你是一个专业的视频分镜师。根据用户需求，生成视频分镜脚本。

每个镜头包含：
- 镜号
- 景别和运镜
- 画面内容
- 时长
- 转场方式""",
            category="creation"
        ),
    ]

    def __init__(self, workspace_dir: str = None, extra_scan_dirs: list = None):
        self.workspace_dir = workspace_dir or os.path.expanduser("~/.aura-studio")
        self.skills_dir = Path(self.workspace_dir) / "skills"
        self.skills_dir.mkdir(parents=True, exist_ok=True)

        # skills: name -> Skill | SkillMd
        self.skills: Dict[str, Any] = {}
        # 先加载内置（旧格式）
        for skill in self.BUILTIN_SKILLS:
            self.skills[skill.name] = skill
        # 再加载自定义（含新旧两种格式）
        self._load_from_dir(self.skills_dir)
        # 扫描额外目录（如项目根 skills/）
        if extra_scan_dirs:
            for d in extra_scan_dirs:
                p = Path(d)
                if p.exists() and p.is_dir():
                    logger.info(f"Scanning extra skill dir: {d}")
                    self._load_from_dir(p)

    def _load_from_dir(self, scan_dir: Path):
        """扫描目录加载技能（兼容 skill.json 和 SKILL.md 两种格式）。"""
        if not scan_dir.exists():
            return
        for entry in scan_dir.iterdir():
            if entry.name.startswith(".") or not entry.is_dir():
                continue
            if entry.name in ("node_modules", "__pycache__", "venv"):
                continue
            # 优先 SKILL.md（新格式）
            skill_md = entry / "SKILL.md"
            if skill_md.exists():
                try:
                    self._load_skill_md(skill_md, source="custom")
                except Exception as e:
                    logger.warning(f"Failed to load SKILL.md {entry.name}: {e}")
                continue
            # 兼容旧格式 skill.json
            skill_json = entry / "skill.json"
            if skill_json.exists():
                try:
                    data = json.loads(skill_json.read_text(encoding="utf-8"))
                    self.skills[data.get("name", entry.name)] = Skill.from_dict(data)
                except Exception as e:
                    logger.warning(f"Failed to load skill.json {entry.name}: {e}")

    def _load_skill_md(self, file_path: Path, source: str = "custom"):
        """加载单个 SKILL.md 技能。"""
        content = file_path.read_text(encoding="utf-8")
        frontmatter = parse_frontmatter(content)
        name = frontmatter.get("name", file_path.parent.name)
        if isinstance(name, list):
            name = name[0] if name else file_path.parent.name
        description = frontmatter.get("description", "")
        if isinstance(description, list):
            description = " ".join(str(d) for d in description if d)
        if not description or not str(description).strip():
            logger.warning(f"SKILL.md {name} has no description, skip")
            return
        self.skills[str(name)] = SkillMd(
            name=str(name),
            description=str(description),
            file_path=str(file_path),
            base_dir=str(file_path.parent),
            content=content,
            frontmatter=frontmatter,
            source=source,
        )

    def get_skill(self, name: str) -> Optional[Any]:
        return self.skills.get(name)

    def list_skills(self, category: str = None) -> List[Dict]:
        """列出所有技能。"""
        result = []
        for s in self.skills.values():
            d = s.to_dict()
            if category and d.get("category") != category:
                continue
            result.append(d)
        return result

    def add_skill(self, skill: Skill) -> bool:
        """添加自定义技能（旧格式 skill.json）。"""
        try:
            skill_dir = self.skills_dir / skill.name
            skill_dir.mkdir(exist_ok=True)
            skill_file = skill_dir / "skill.json"
            skill_file.write_text(
                json.dumps(skill.to_dict(), ensure_ascii=False, indent=2),
                encoding="utf-8"
            )
            self.skills[skill.name] = skill
            return True
        except Exception as e:
            logger.error(f"Failed to add skill: {e}")
            return False

    def add_skill_md(self, name: str, description: str, body: str, category: str = "custom") -> bool:
        """创建新格式 SKILL.md 技能。

        Args:
            name: 技能名（hyphen-case）
            description: 描述（触发用）
            body: SKILL.md 正文（Markdown 指令）
            category: 分类
        """
        try:
            skill_dir = self.skills_dir / name
            skill_dir.mkdir(parents=True, exist_ok=True)
            content = f"""---
name: {name}
description: {description}
category: {category}
---

{body}
"""
            skill_file = skill_dir / "SKILL.md"
            skill_file.write_text(content, encoding="utf-8")
            # 重新加载这个技能
            self._load_skill_md(skill_file, source="custom")
            return True
        except Exception as e:
            logger.error(f"Failed to add SKILL.md: {e}")
            return False

    def remove_skill(self, name: str) -> bool:
        """移除自定义技能（只能移除自定义，不能移除内置）"""
        if name in [s.name for s in self.BUILTIN_SKILLS]:
            logger.warning("Cannot remove builtin skill")
            return False
        if name in self.skills:
            del self.skills[name]
            skill_dir = self.skills_dir / name
            if skill_dir.exists():
                import shutil
                shutil.rmtree(skill_dir)
            return True
        return False

    def get_skills_prompt(self, skill_names: list = None) -> str:
        """生成技能提示词，注入系统提示词。

        Args:
            skill_names: 要包含的技能名列表（None 表示全部）。
        """
        if not self.skills:
            return ""

        # 如果指定了 skill_names，过滤
        filtered = self.skills
        if skill_names is not None:
            filtered = {k: v for k, v in self.skills.items() if k in skill_names}

        parts = ["\n\n## 可用技能\n"]

        # 新格式技能：XML 列表（progressive disclosure —— 只列元数据，模型按需读取 body）
        md_skills = [s for s in filtered.values() if isinstance(s, SkillMd)]
        if md_skills:
            parts.append("<available_skills>")
            parts.append("以下技能可通过 read 工具读取 SKILL.md 了解详细用法，按其指令执行（必要时用 bash 运行 scripts/ 下的脚本）：")
            for s in md_skills:
                parts.append(f"  <skill>")
                parts.append(f"    <name>{_escape_xml(s.name)}</name>")
                parts.append(f"    <description>{_escape_xml(s.description)}</description>")
                parts.append(f"    <location>{_escape_xml(s.file_path)}</location>")
                parts.append(f"    <base_dir>{_escape_xml(s.base_dir)}</base_dir>")
                parts.append(f"  </skill>")
            parts.append("</available_skills>\n")

        # 旧格式技能：纯 prompt 注入
        legacy_skills = [s for s in filtered.values() if isinstance(s, Skill)]
        for s in legacy_skills:
            parts.append(f"### {s.name}")
            parts.append(f"描述: {s.description}")
            parts.append(f"提示词: {s.prompt[:200]}...")
            parts.append("")

        return "\n".join(parts)

    def get_stats(self) -> Dict:
        """获取技能统计"""
        categories = {}
        md_count = 0
        legacy_count = 0
        for s in self.skills.values():
            cat = s.to_dict().get("category", "general")
            categories[cat] = categories.get(cat, 0) + 1
            if isinstance(s, SkillMd):
                md_count += 1
            else:
                legacy_count += 1
        return {
            "total": len(self.skills),
            "builtin": len(self.BUILTIN_SKILLS),
            "custom": len(self.skills) - len(self.BUILTIN_SKILLS),
            "markdown": md_count,
            "legacy": legacy_count,
            "categories": categories,
        }
