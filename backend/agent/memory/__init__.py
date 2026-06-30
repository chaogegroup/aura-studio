"""
Memory 记忆系统 - 三层架构 + 向量检索
基于 CowAgent Memory (MIT License, Copyright 2022 zhayujie)

三层结构：
- Context Memory: 当前对话上下文（会话内）
- Daily Memory: 每日对话摘要（跨会话）
- Core Memory: 核心偏好和长期知识（永久）
- Vector Store: 向量检索（语义近似）

注意：本文件是 `agent.memory` 包的入口。包内还有：
- `agent.memory.embedding`  Embedding 供应商
- `agent.memory.vector_store`  向量存储 + 混合检索
"""

import json
import os
import time
import logging
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime, timedelta

logger = logging.getLogger("aura-memory")


class MemoryManager:
    """
    记忆管理器

    存储结构：
    - context: 当前会话的消息历史
    - daily: 按日期组织的对话摘要
    - core: 核心偏好和长期记忆
    - vector: 向量索引（可选，需配置 embedding provider）
    """

    def __init__(self, workspace_dir: str = None, embedding_provider=None):
        self.workspace_dir = workspace_dir or os.path.expanduser("~/.aura-studio")
        self.memory_dir = Path(self.workspace_dir) / "memory"
        self.memory_dir.mkdir(parents=True, exist_ok=True)

        # 文件路径
        self.context_file = self.memory_dir / "context.json"
        self.daily_dir = self.memory_dir / "daily"
        self.core_file = self.memory_dir / "core.json"
        self.daily_dir.mkdir(exist_ok=True)

        # 向量存储（可选）
        self.embedding_provider = embedding_provider
        self._vector_store = None

    @property
    def vector_store(self):
        """懒加载向量存储"""
        if self._vector_store is None and self.embedding_provider:
            try:
                from .vector_store import VectorStore
                db_path = str(self.memory_dir / "vector.db")
                self._vector_store = VectorStore(db_path)
            except Exception as e:
                logger.warning(f"Vector store init failed: {e}")
        return self._vector_store

    # ============ Context Memory ============

    def get_context(self) -> List[Dict]:
        if self.context_file.exists():
            try:
                return json.loads(self.context_file.read_text(encoding="utf-8"))
            except Exception:
                return []
        return []

    def save_context(self, messages: List[Dict]):
        try:
            self.context_file.write_text(
                json.dumps(messages, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        except Exception as e:
            logger.error(f"Failed to save context: {e}")

    def clear_context(self):
        if self.context_file.exists():
            self.context_file.unlink()

    # ============ Daily Memory ============

    def add_daily_summary(self, summary: str, date: str = None):
        if not date:
            date = datetime.now().strftime("%Y-%m-%d")
        daily_file = self.daily_dir / f"{date}.json"
        entries = []
        if daily_file.exists():
            try:
                entries = json.loads(daily_file.read_text(encoding="utf-8"))
            except Exception:
                entries = []
        entries.append({"timestamp": time.time(), "summary": summary})
        try:
            daily_file.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as e:
            logger.error(f"Failed to save daily summary: {e}")

    def get_daily_summaries(self, days: int = 7) -> List[Dict]:
        summaries = []
        today = datetime.now()
        for i in range(days):
            date = (today - timedelta(days=i)).strftime("%Y-%m-%d")
            daily_file = self.daily_dir / f"{date}.json"
            if daily_file.exists():
                try:
                    entries = json.loads(daily_file.read_text(encoding="utf-8"))
                    summaries.append({"date": date, "entries": entries})
                except Exception:
                    pass
        return summaries

    # ============ Core Memory ============

    def get_core_memory(self) -> Dict:
        if self.core_file.exists():
            try:
                return json.loads(self.core_file.read_text(encoding="utf-8"))
            except Exception:
                return {}
        return {}

    def save_core_memory(self, data: Dict):
        try:
            self.core_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as e:
            logger.error(f"Failed to save core memory: {e}")

    def update_core_memory(self, key: str, value):
        core = self.get_core_memory()
        core[key] = value
        core["updated_at"] = time.time()
        self.save_core_memory(core)

    # ============ 向量记忆 ============

    def embed_text(self, text: str) -> Optional[List[float]]:
        """将文本转为向量"""
        if not self.embedding_provider:
            return None
        try:
            results = self.embedding_provider.embed([text])
            return results[0] if results else None
        except Exception as e:
            logger.warning(f"Embedding failed: {e}")
            return None

    def index_messages(self, messages: List[Dict]):
        """将对话消息索引到向量存储"""
        vs = self.vector_store
        if not vs or not self.embedding_provider:
            return

        texts = []
        # 只索引用户消息和助手回复
        for m in messages:
            content = m.get("content", "")
            if isinstance(content, str) and content.strip() and m.get("role") in ("user", "assistant"):
                texts.append((content[:300], m.get("role", "unknown")))  # 限制长度，避免 embedding 超限

        if not texts:
            return

        try:
            embeddings = self.embedding_provider.embed([t[0] for t in texts])
            chunks = []
            for i, (content, role) in enumerate(texts):
                if i < len(embeddings) and embeddings[i]:
                    chunks.append((content, embeddings[i], role, "", 0))
            if chunks:
                vs.add_chunks_batch(chunks)
                logger.debug(f"Indexed {len(chunks)} messages to vector store")
        except Exception as e:
            logger.warning(f"Index failed: {e}")

    def search_relevant(self, query: str, top_k: int = 5) -> List[Dict]:
        """
        检索相关记忆（混合检索：向量 + 关键词 + 时间衰减）

        Args:
            query: 查询文本
            top_k: 返回数量

        Returns:
            [{content, score, source, created_at}, ...]
        """
        results = []
        # 防御：query 必须是字符串，否则跳过（避免 .lower() 崩溃）
        if not query or not isinstance(query, str):
            return results

        # 1. 向量检索（如有）
        vs = self.vector_store
        if vs and self.embedding_provider:
            try:
                query_vec = self.embed_text(query)
                if query_vec:
                    vec_results = vs.search(
                        query_vector=query_vec,
                        query_text=query,
                        top_k=top_k,
                        min_score=0.2,
                        vector_weight=0.7,
                        keyword_weight=0.3,
                    )
                    for r in vec_results:
                        results.append({
                            "content": r.get("content", ""),
                            "score": round(r.get("score", 0), 4),
                            "source": r.get("source", "vector"),
                            "created_at": r.get("created_at", 0),
                        })
            except Exception as e:
                logger.warning(f"Vector search failed: {e}")

        # 2. 关键词检索（兜底）
        if not results:
            kw = self.search(query)
            for r in kw:
                results.append({
                    "content": r.get("content", ""),
                    "score": 0.5,
                    "source": r.get("source", "context"),
                    "created_at": time.time(),
                })

        return results[:top_k]

    # ============ 传统关键词搜索 ============

    def search(self, query: str, scope: str = "all") -> List[Dict]:
        """传统关键词搜索（兜底）"""
        results = []
        query_lower = query.lower()

        if scope in ("context", "all"):
            for msg in self.get_context():
                content = msg.get("content", "")
                if query_lower in content.lower():
                    results.append({"source": "context", "content": str(content)[:200]})

        if scope in ("daily", "all"):
            for summary in self.get_daily_summaries(30):
                for entry in summary.get("entries", []):
                    if query_lower in entry.get("summary", "").lower():
                        results.append({
                            "source": "daily", "date": summary["date"],
                            "content": entry["summary"][:200]
                        })

        if scope in ("core", "all"):
            core = self.get_core_memory()
            for key, value in core.items():
                if isinstance(value, str) and query_lower in value.lower():
                    results.append({"source": "core", "key": key, "content": value[:200]})

        return results

    # ============ 统计 ============

    def get_stats(self) -> Dict:
        context = self.get_context()
        core = self.get_core_memory()
        daily_files = list(self.daily_dir.glob("*.json"))
        stats = {
            "context_messages": len(context),
            "core_fields": len(core),
            "daily_files": len(daily_files),
            "memory_dir": str(self.memory_dir),
            "vector_available": self.embedding_provider is not None,
        }
        if self._vector_store:
            try:
                vstats = self._vector_store.get_stats()
                stats["vector_chunks"] = vstats.get("total_chunks", 0)
            except Exception:
                stats["vector_chunks"] = 0
        # 梦境日记数量（Deep Dream 蒸馏产物）
        try:
            dreams_dir = self.memory_dir / "dreams"
            stats["dream_diaries"] = len(list(dreams_dir.glob("*.md"))) if dreams_dir.exists() else 0
        except Exception:
            stats["dream_diaries"] = 0
        return stats
