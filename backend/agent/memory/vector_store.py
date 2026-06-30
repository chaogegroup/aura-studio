"""
向量存储 + 混合检索引擎
SQLite + FTS5 全文索引 + numpy 向量余弦相似度 + 时间衰减

结构：
- chunks 表：content + embedding(float32 BLOB) + metadata
- fts_chunks 虚拟表：FTS5 全文索引
- files 表：文件追踪
"""

import json
import sqlite3
import logging
import time
import hashlib
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from datetime import datetime

logger = logging.getLogger("aura-vectorstore")

# 是否可用 numpy (若不可用则回退到 Python 纯循环，慢但能用)
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False
    logger.warning("numpy not installed, vector search will use slow Python loop")


class VectorStore:
    """
    向量存储 + 混合检索

    依赖：sqlite3 (built-in), numpy (加速，可选)
    """

    def __init__(self, db_path: str):
        self.db_path = db_path
        self._conn = None
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        if self._conn is None:
            self._conn = sqlite3.connect(self.db_path)
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA synchronous=NORMAL")
        return self._conn

    def _init_db(self):
        conn = self._get_conn()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT NOT NULL DEFAULT '',
                chunk_index INTEGER NOT NULL DEFAULT 0,
                content TEXT NOT NULL,
                tokens INTEGER NOT NULL DEFAULT 0,
                embedding BLOB,
                created_at REAL NOT NULL,
                source TEXT NOT NULL DEFAULT 'conversation'
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS files (
                path TEXT PRIMARY KEY,
                hash TEXT NOT NULL DEFAULT '',
                updated_at REAL NOT NULL DEFAULT 0
            )
        """)
        # FTS5 全文索引
        try:
            conn.execute("""
                CREATE VIRTUAL TABLE IF NOT EXISTS fts_chunks USING fts5(
                    content, content=chunks, content_rowid=id
                )
            """)
        except sqlite3.OperationalError:
            # SQLite 编译时可能没开 FTS5
            logger.warning("FTS5 not available, keyword search will use LIKE")
        conn.commit()

    def close(self):
        if self._conn:
            self._conn.close()
            self._conn = None

    # ============ 写入 ============

    def add_chunk(self, content: str, embedding: List[float],
                  source: str = "conversation", file_path: str = "",
                  chunk_index: int = 0) -> int:
        """添加一个文本块及其向量"""
        conn = self._get_conn()
        emb_bytes = self._vector_to_blob(embedding)
        now = time.time()
        cursor = conn.execute(
            "INSERT INTO chunks (file_path, chunk_index, content, tokens, embedding, created_at, source) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (file_path, chunk_index, content, len(content), emb_bytes, now, source)
        )
        chunk_id = cursor.lastrowid
        # 同步 FTS5
        try:
            conn.execute("INSERT INTO fts_chunks(rowid, content) VALUES (?, ?)", (chunk_id, content))
        except sqlite3.OperationalError:
            pass
        conn.commit()
        return chunk_id

    def add_chunks_batch(self, chunks: List[Tuple[str, List[float], str, str, int]]):
        """批量添加文本块（content, embedding, source, file_path, chunk_index）"""
        conn = self._get_conn()
        now = time.time()
        data = []
        for content, embedding, source, file_path, chunk_index in chunks:
            emb_bytes = self._vector_to_blob(embedding)
            data.append((file_path, chunk_index, content, len(content), emb_bytes, now, source))
        conn.executemany(
            "INSERT INTO chunks (file_path, chunk_index, content, tokens, embedding, created_at, source) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)", data
        )
        # 获取最后插入的 ID
        last_id = conn.execute("SELECT MAX(id) FROM chunks").fetchone()[0] or 0
        first_id = last_id - len(data) + 1
        # 同步 FTS5
        try:
            for i, (content, _, _, _, _) in enumerate(chunks):
                cid = first_id + i
                conn.execute("INSERT INTO fts_chunks(rowid, content) VALUES (?, ?)", (cid, content))
        except sqlite3.OperationalError:
            pass
        conn.commit()

    # ============ 检索 ============

    def search(self, query_vector: List[float], query_text: str = "",
               top_k: int = 10, min_score: float = 0.3,
               vector_weight: float = 0.7, keyword_weight: float = 0.3) -> List[Dict]:
        """
        混合检索：向量余弦相似度 + FTS5 BM25 关键词

        Args:
            query_vector: 查询向量
            query_text: 查询文本（用于关键词检索）
            top_k: 返回 top K
            min_score: 最低分数
            vector_weight: 向量检索权重
            keyword_weight: 关键词检索权重

        Returns:
            [{id, content, score, source, created_at, similarity, keyword_score}, ...]
        """
        if not query_vector:
            return []

        # 1. 向量检索
        vec_results = self._vector_search(query_vector, top_k=top_k * 2) if query_vector else []

        # 2. 关键词检索
        kw_results = self._keyword_search(query_text, top_k=top_k * 2) if query_text else []

        # 3. 混合合并 + 时间衰减
        return self._merge_results(vec_results, kw_results, top_k, min_score,
                                   vector_weight, keyword_weight)

    def _vector_search(self, query_vector: List[float], top_k: int = 20) -> List[Dict]:
        """向量余弦相似度检索"""
        conn = self._get_conn()
        cursor = conn.execute(
            "SELECT id, content, embedding, source, created_at FROM chunks WHERE embedding IS NOT NULL"
        )
        rows = cursor.fetchall()
        if not rows:
            return []

        ids, contents, embeddings_blob, sources, times = zip(*rows)
        query_arr = np.array(query_vector, dtype=np.float32)

        if HAS_NUMPY and len(embeddings_blob) > 0:
            # numpy 矩阵乘法加速
            all_vecs = np.array([np.frombuffer(b, dtype=np.float32) for b in embeddings_blob], dtype=np.float32)
            q_norm = np.linalg.norm(query_arr)
            v_norms = np.linalg.norm(all_vecs, axis=1)
            similarities = np.dot(all_vecs, query_arr) / (v_norms * q_norm + 1e-10)
            indices = np.argsort(-similarities)[:top_k]
            results = []
            for idx in indices:
                if idx < len(rows):
                    results.append({
                        "id": ids[idx], "content": contents[idx],
                        "similarity": float(similarities[idx]),
                        "source": sources[idx], "created_at": times[idx],
                    })
            return results
        else:
            # 纯 Python 回退
            scored = []
            for i, emb_blob in enumerate(embeddings_blob):
                vec = np.frombuffer(emb_blob, dtype=np.float32)
                sim = float(np.dot(vec, query_arr) / (np.linalg.norm(vec) * np.linalg.norm(query_arr) + 1e-10))
                scored.append((sim, i))
            scored.sort(key=lambda x: -x[0])
            return [{
                "id": ids[i], "content": contents[i],
                "similarity": s, "source": sources[i], "created_at": times[i],
            } for s, i in scored[:top_k]]

    def _keyword_search(self, query_text: str, top_k: int = 20) -> List[Dict]:
        """FTS5 全文检索"""
        if not query_text or len(query_text.strip()) < 2:
            return []

        conn = self._get_conn()
        try:
            # FTS5 BM25 排序
            cursor = conn.execute(
                "SELECT c.id, c.content, c.source, c.created_at, "
                "bm25(fts_chunks) as score "
                "FROM fts_chunks JOIN chunks c ON fts_chunks.rowid = c.id "
                "WHERE fts_chunks MATCH ? ORDER BY score LIMIT ?",
                (query_text, top_k)
            )
            rows = cursor.fetchall()
            return [{
                "id": r[0], "content": r[1], "source": r[2],
                "created_at": r[3], "keyword_score": float(r[4]) if r[4] else 1.0,
            } for r in rows]
        except sqlite3.OperationalError:
            # FTS5 不可用，回退 LIKE
            cursor = conn.execute(
                "SELECT id, content, source, created_at FROM chunks "
                "WHERE content LIKE ? ORDER BY id DESC LIMIT ?",
                (f"%{query_text}%", top_k)
            )
            return [{"id": r[0], "content": r[1], "source": r[2],
                     "created_at": r[3], "keyword_score": 1.0} for r in cursor.fetchall()]

    def _merge_results(self, vec_results: List[Dict], kw_results: List[Dict],
                       top_k: int, min_score: float,
                       vec_weight: float, kw_weight: float) -> List[Dict]:
        """合并向量和关键词结果，加时间衰减"""
        merged = {}

        # 向量结果
        for r in vec_results:
            decay = self._time_decay(r["created_at"])
            score = r["similarity"] * vec_weight * decay
            merged[r["id"]] = {**r, "score": score, "keyword_score": 0}

        # 关键词结果
        for r in kw_results:
            decay = self._time_decay(r["created_at"])
            score = r.get("keyword_score", 1.0) * kw_weight * decay
            if r["id"] in merged:
                merged[r["id"]]["score"] += score
                merged[r["id"]]["keyword_score"] = r.get("keyword_score", 1.0)
            else:
                merged[r["id"]] = {**r, "similarity": 0, "score": score}

        # 排序 + 过滤
        results = sorted(merged.values(), key=lambda x: -x["score"])
        return [r for r in results if r["score"] >= min_score][:top_k]

    @staticmethod
    def _time_decay(created_at: float, half_life_days: int = 30) -> float:
        """时间衰减：30天半衰期指数衰减"""
        hours_ago = (time.time() - created_at) / 3600
        return 2 ** (-hours_ago / (half_life_days * 24))

    @staticmethod
    def _vector_to_blob(vector: List[float]) -> bytes:
        """向量转 float32 BLOB"""
        arr = np.array(vector, dtype=np.float32)
        return arr.tobytes()

    # ============ 管理 ============

    def count_chunks(self) -> int:
        conn = self._get_conn()
        return conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]

    def clear_all(self):
        conn = self._get_conn()
        conn.execute("DELETE FROM chunks")
        conn.execute("DELETE FROM files")
        try:
            conn.execute("DELETE FROM fts_chunks")
        except sqlite3.OperationalError:
            pass
        conn.commit()

    def get_stats(self) -> Dict:
        conn = self._get_conn()
        total = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
        by_source = {}
        for r in conn.execute("SELECT source, COUNT(*) FROM chunks GROUP BY source").fetchall():
            by_source[r[0]] = r[1]
        return {"total_chunks": total, "by_source": by_source}