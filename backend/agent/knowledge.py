"""
Knowledge 知识库系统
基于 CowAgent Knowledge (MIT License, Copyright 2022 zhayujie)
适配 AURA Studio 的创作场景

Markdown wiki 布局（对齐 CowAgent）：
    knowledge/index.md              索引（每条一行：- [标题](category/slug.md) - 简介）
    knowledge/<category>/<slug>.md  分类知识页（Markdown 正文 + [[交叉引用]]）

分类（含 AURA 创作专属）：
    entities/   人物/公司/项目
    concepts/   技术概念/方法论
    sources/    文章/链接/文档摘要
    analysis/   深度讨论结论/方案
    creation/   AURA 专属：角色/场景/道具/风格

设计：本服务是纯文件系统读写器 + 图谱解析器，不调 LLM。
"自动策展"由 system prompt 的写入规则驱动 —— agent 在对话中用 write 工具直接写 .md。
"""

import os
import re
import time
import logging
from pathlib import Path
from typing import List, Dict, Optional

logger = logging.getLogger("aura-knowledge")


# 知识分类（AURA 创作场景适配）
CATEGORIES = {
    "entities": "人物/公司/项目",
    "concepts": "技术概念/方法论",
    "sources": "文章/链接/文档摘要",
    "analysis": "深度讨论结论/方案",
    "creation": "角色/场景/道具/风格",
}


class KnowledgeService:
    """
    知识库服务（Markdown wiki）

    所有操作直接基于文件系统。agent 通过 write 工具写入知识页，
    本服务负责读取、列表、图谱解析。
    """

    def __init__(self, workspace_dir: str = None):
        self.workspace_dir = workspace_dir or os.path.expanduser("~/.aura-studio")
        self.knowledge_dir = Path(self.workspace_dir) / "knowledge"
        self.knowledge_dir.mkdir(parents=True, exist_ok=True)
        # 确保分类目录存在
        for cat in CATEGORIES:
            (self.knowledge_dir / cat).mkdir(exist_ok=True)
        # 确保 index.md 存在
        self.index_file = self.knowledge_dir / "index.md"
        if not self.index_file.exists():
            self.index_file.write_text("# 知识库索引\n\n", encoding="utf-8")

    # ============ 列表：目录树 ============

    def list_tree(self) -> Dict:
        """递归扫描知识目录，返回分类目录树 + 统计。

        Returns:
            {"tree": [{"dir","files":[{"name","title","size"}],"children":[]}],
             "stats": {"pages": N, "size": N}}
        """
        stats = {"pages": 0, "size": 0}
        root_files, tree = self._scan_dir(self.knowledge_dir, stats, is_root=True)
        return {"root_files": root_files, "tree": tree, "stats": stats}

    def _scan_dir(self, dir_path: Path, stats: Dict, is_root: bool = False) -> tuple:
        """递归扫描目录。返回 (files, children)。"""
        files = []
        children = []
        try:
            entries = sorted(dir_path.iterdir(), key=lambda p: p.name)
        except Exception:
            return files, children
        for p in entries:
            if p.name.startswith("."):
                continue
            if p.is_dir():
                sub_files, sub_children = self._scan_dir(p, stats)
                children.append({"dir": p.name, "files": sub_files, "children": sub_children})
            elif p.suffix == ".md":
                size = p.stat().st_size
                if not is_root:
                    stats["pages"] += 1
                    stats["size"] += size
                title = p.stem
                try:
                    first_line = p.read_text(encoding="utf-8").strip().split("\n")[0]
                    if first_line.startswith("# "):
                        title = first_line[2:].strip()
                except Exception:
                    pass
                files.append({"name": p.name, "title": title, "size": size})
        return files, children

    # ============ 读取：单个文件 ============

    def read_file(self, rel_path: str) -> Dict:
        """读取单个知识页内容。

        Args:
            rel_path: knowledge/ 下的相对路径，如 "entities/foo.md"

        Returns:
            {"content": str, "path": str}

        Raises:
            ValueError: 路径越界
            FileNotFoundError: 文件不存在
        """
        if not rel_path or ".." in rel_path:
            raise ValueError("invalid path")
        full_path = os.path.normpath(self.knowledge_dir / rel_path)
        allowed = os.path.normpath(self.knowledge_dir)
        if not full_path.startswith(allowed + os.sep) and full_path != allowed:
            raise ValueError("path outside knowledge dir")
        if not os.path.isfile(full_path):
            raise FileNotFoundError(f"file not found: {rel_path}")
        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()
        return {"content": content, "path": rel_path}

    # ============ 图谱：交叉引用解析 ============

    def build_graph(self) -> Dict:
        """解析所有知识页的交叉引用，生成图谱 nodes/links。

        支持两种链接语法：
        - [[target]]  wiki 风格（target 可含或不含 .md）
        - [text](path.md)  Markdown 链接

        Returns:
            {"nodes": [{"id","label","category"}], "links": [{"source","target"}]}
        """
        if not self.knowledge_dir.is_dir():
            return {"nodes": [], "links": []}

        nodes: Dict[str, Dict] = {}
        links = []
        # wiki [[link]] 和 markdown [text](link.md) 两种
        wiki_re = re.compile(r'\[\[([^\]]+)\]\]')
        md_re = re.compile(r'\[([^\]]*)\]\(([^)]+\.md)\)')

        for md_file in self.knowledge_dir.rglob("*.md"):
            rel = str(md_file.relative_to(self.knowledge_dir)).replace("\\", "/")
            if rel in ("index.md", "log.md"):
                continue
            parts = rel.split("/")
            category = parts[0] if len(parts) > 1 else "root"
            title = md_file.stem.replace("-", " ")
            try:
                content = md_file.read_text(encoding="utf-8")
                first_line = content.strip().split("\n")[0]
                if first_line.startswith("# "):
                    title = first_line[2:].strip()

                # 解析 [[wiki]] 链接
                for link_target in wiki_re.findall(content):
                    target = self._resolve_link(link_target, md_file)
                    if target and target != rel:
                        links.append({"source": rel, "target": target})
                # 解析 [text](path.md) 链接
                for _, link_target in md_re.findall(content):
                    target = self._resolve_link(link_target, md_file)
                    if target and target != rel:
                        links.append({"source": rel, "target": target})
            except Exception:
                pass
            nodes[rel] = {"id": rel, "label": title, "category": category}

        # 过滤无效链接 + 去重
        valid_ids = set(nodes.keys())
        links = [l for l in links if l["source"] in valid_ids and l["target"] in valid_ids]
        seen = set()
        deduped = []
        for l in links:
            key = tuple(sorted([l["source"], l["target"]]))
            if key not in seen:
                seen.add(key)
                deduped.append(l)

        return {"nodes": list(nodes.values()), "links": deduped}

    def _resolve_link(self, target: str, source_file: Path) -> Optional[str]:
        """把链接目标解析成 knowledge/ 下的相对路径。

        规则：
        - 若 target 含 "/"（如 concepts/deep-learning），从 knowledge 根目录解析
        - 否则（纯页面名），从源文件所在目录解析
        """
        target = target.strip()
        if not target:
            return None
        if not target.endswith(".md"):
            target = target + ".md"
        try:
            if "/" in target:
                # 绝对路径，从 knowledge 根解析
                resolved = (self.knowledge_dir / target).resolve()
            else:
                # 相对路径，从源文件目录解析
                resolved = (source_file.parent / target).resolve()
            return str(resolved.relative_to(self.knowledge_dir)).replace("\\", "/")
        except ValueError:
            return None

    # ============ 写入：知识页 ============

    def write_page(self, category: str, slug: str, content: str) -> str:
        """写入一篇知识页。

        Args:
            category: 分类目录名
            slug: 文件名（不含 .md，会做清洗）
            content: Markdown 正文

        Returns:
            写入的相对路径，如 "entities/foo.md"
        """
        if category not in CATEGORIES:
            logger.warning(f"Unknown category: {category}, fallback to 'analysis'")
            category = "analysis"
        # slug 清洗：只去特殊字符，保留字母数字连字符
        slug = re.sub(r'[^\w-]', '', slug.replace(' ', '-').lower())
        slug = re.sub(r'-+', '-', slug)[:80] or "untitled"
        cat_dir = self.knowledge_dir / category
        cat_dir.mkdir(exist_ok=True)
        page_file = cat_dir / f"{slug}.md"
        page_file.write_text(content, encoding="utf-8")
        rel = f"{category}/{slug}.md"
        logger.info(f"Knowledge page written: {rel}")
        return rel

    def update_index(self):
        """根据现有 .md 文件重建 index.md 索引。"""
        lines = ["# 知识库索引", ""]
        tree = self.list_tree().get("tree", [])
        for node in tree:
            cat = node["dir"]
            cat_label = CATEGORIES.get(cat, cat)
            if not node["files"]:
                continue
            lines.append(f"## {cat_label}")
            for f in node["files"]:
                slug = f["name"].replace(".md", "")
                lines.append(f"- [{f['title']}]({cat}/{slug}.md)")
            lines.append("")
        self.index_file.write_text("\n".join(lines), encoding="utf-8")

    def read_index(self) -> str:
        """读取 index.md 内容（供注入 system prompt）。"""
        if self.index_file.exists():
            try:
                return self.index_file.read_text(encoding="utf-8").strip()
            except Exception:
                return ""
        return ""

    # ============ 搜索 ============

    def search(self, query: str) -> List[Dict]:
        """全文搜索知识页。"""
        results = []
        if not query or not query.strip():
            return results
        query_lower = query.lower()
        for md_file in self.knowledge_dir.rglob("*.md"):
            if md_file.name == "index.md":
                continue
            try:
                content = md_file.read_text(encoding="utf-8")
                if query_lower in content.lower():
                    rel = str(md_file.relative_to(self.knowledge_dir)).replace("\\", "/")
                    first_line = content.strip().split("\n")[0]
                    title = first_line[2:].strip() if first_line.startswith("# ") else md_file.stem
                    # 摘取匹配上下文
                    idx = content.lower().find(query_lower)
                    snippet = content[max(0, idx - 40):idx + 100].replace("\n", " ")
                    results.append({"path": rel, "title": title, "snippet": snippet})
            except Exception:
                pass
        return results[:20]

    # ============ 统计 ============

    def get_stats(self) -> Dict:
        """获取知识库统计。"""
        tree_data = self.list_tree()
        stats = tree_data["stats"]
        by_category = {}
        for node in tree_data["tree"]:
            by_category[node["dir"]] = len(node["files"])
        return {
            "total_pages": stats["pages"],
            "total_size": stats["size"],
            "by_category": by_category,
            "knowledge_dir": str(self.knowledge_dir),
        }

    # ============ 兼容封装（供 evolution 等旧调用方使用）============

    def add_entry(self, category: str, name: str, content: str, metadata: Dict = None):
        """兼容旧接口：把条目写成一篇 .md。

        evolution.py 的 [KNOWLEDGE] 段会调这个方法。
        category 映射到 wiki 分类目录。
        """
        # 旧分类名映射到新分类
        cat_map = {
            "characters": "creation", "scenes": "creation", "props": "creation",
            "styles": "creation", "techniques": "concepts", "preferences": "analysis",
        }
        wiki_cat = cat_map.get(category, category if category in CATEGORIES else "analysis")
        # 内容带标题
        md_content = f"# {name}\n\n{content}\n"
        if metadata:
            md_content += f"\n---\nmetadata: {metadata}\n"
        return self.write_page(wiki_cat, name, md_content)

    def list_entries(self, category: str = None) -> List[Dict]:
        """兼容旧接口：返回扁平条目列表（供路由/前端渐进迁移）。"""
        tree_data = self.list_tree()
        entries = []
        for node in tree_data["tree"]:
            if category and node["dir"] != category:
                continue
            for f in node["files"]:
                entries.append({
                    "category": node["dir"],
                    "name": f["title"],
                    "slug": f["name"].replace(".md", ""),
                    "description": "",
                })
        return entries

    def get_graph(self) -> Dict:
        """兼容旧接口。"""
        return self.build_graph()
