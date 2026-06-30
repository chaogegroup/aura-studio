"""
Embedding Provider - 纯手动配置，不绑定任何供应商
"""

import logging
from typing import List, Optional

logger = logging.getLogger("aura-embedding")


class EmbeddingProvider:
    """Embedding 供应商基类"""

    def __init__(self, model: str, dim: int, api_key: str, api_base: str):
        self.model = model
        self.dim = dim
        self.api_key = api_key
        self.api_base = api_base.rstrip("/")

    def embed(self, texts: List[str]) -> List[List[float]]:
        raise NotImplementedError

    @property
    def dimensions(self) -> int:
        return self.dim


class OpenAICompatibleProvider(EmbeddingProvider):
    """通用 OpenAI 兼容格式的 embedding API"""

    # 单条文本最大字符数（bge 模型 512 token 上限，中文约 350 字，留余量）
    MAX_CHARS_PER_TEXT = 300
    # 批量请求最大条数
    MAX_BATCH_SIZE = 10

    def embed(self, texts: List[str]) -> List[List[float]]:
        import httpx
        if not texts:
            return []
        # 预处理：截断超长文本，过滤空文本
        processed = []
        for t in texts:
            if not t or not str(t).strip():
                processed.append(None)  # 占位，保持索引对应
            else:
                processed.append(str(t)[:self.MAX_CHARS_PER_TEXT])

        results = [None] * len(processed)
        # 分批请求，每批最多 MAX_BATCH_SIZE 条非空文本
        batch = []
        batch_indices = []
        for i, t in enumerate(processed):
            if t is None:
                continue
            batch.append(t)
            batch_indices.append(i)
            if len(batch) >= self.MAX_BATCH_SIZE:
                self._embed_batch(batch, batch_indices, results)
                batch = []
                batch_indices = []
        # 处理剩余
        if batch:
            self._embed_batch(batch, batch_indices, results)

        # 过滤掉 None（失败的条目），返回有效向量
        return [r for r in results if r is not None]

    def _embed_batch(self, batch: List[str], indices: List[int], results: list):
        """请求一批文本的 embedding，结果填入 results。失败时逐条降级重试。"""
        import httpx
        try:
            with httpx.Client(verify=False, timeout=60) as client:
                resp = client.post(
                    f"{self.api_base}/embeddings",
                    json={"model": self.model, "input": batch},
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                )
                resp.raise_for_status()
                data = resp.json()
                for item in data.get("data", []):
                    idx = item.get("index", 0)
                    if idx < len(indices):
                        results[indices[idx]] = item["embedding"]
        except Exception as e:
            logger.warning(f"Embedding batch failed ({len(batch)} texts): {e}")
            # 批量失败时逐条降级重试，尽量挽救
            for j, text in enumerate(batch):
                try:
                    with httpx.Client(verify=False, timeout=30) as client:
                        resp = client.post(
                            f"{self.api_base}/embeddings",
                            json={"model": self.model, "input": [text]},
                            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                        )
                        resp.raise_for_status()
                        data = resp.json()
                        items = data.get("data", [])
                        if items:
                            results[indices[j]] = items[0]["embedding"]
                except Exception as e2:
                    logger.debug(f"Embedding single text failed: {e2}")


def create_embedding_provider(
    api_key: str,
    api_base: str,
    model: str = "text-embedding-3-small",
    dimensions: int = 1024,
) -> Optional[EmbeddingProvider]:
    """
    创建 embedding provider

    Args:
        api_key: API Key
        api_base: API 地址（如 https://api.openai.com/v1）
        model: 模型名（如 text-embedding-3-small）
        dimensions: 向量维度
    """
    if not api_key or not api_base:
        return None
    try:
        return OpenAICompatibleProvider(
            model=model, dim=dimensions, api_key=api_key, api_base=api_base
        )
    except Exception as e:
        logger.error(f"Failed to create embedding provider: {e}")
        return None


def create_provider_from_config(config: dict) -> Optional[EmbeddingProvider]:
    """从 user_config.json 读取配置创建 provider"""
    api_key = (config.get("embedding_api_key") or "").strip()
    api_base = (config.get("embedding_api_base") or "").strip()
    if not api_key or not api_base:
        return None
    model = (config.get("embedding_model") or "").strip() or "text-embedding-3-small"
    try:
        dim = int(config.get("embedding_dimensions") or 0)
    except (TypeError, ValueError):
        dim = 0
    if dim <= 0:
        dim = 1024
    return create_embedding_provider(
        api_key=api_key, api_base=api_base, model=model, dimensions=dim
    )
