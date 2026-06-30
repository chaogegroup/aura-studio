"""
同步 LLM 调用客户端

供后台线程（自我进化、Deep Dream 蒸馏）使用 —— 这些任务在独立线程中运行，
不适合用 protocol.py 的 async 流式接口。本模块提供同步（阻塞）的非流式调用。

复用 api/routes/chat.py 里已验证的 urllib + SSL 免验证模式，避免新增 httpx 同步依赖。
"""

import json
import ssl
import logging
import urllib.request as urllib_req
from typing import List, Dict, Optional

logger = logging.getLogger("aura-llm-client")

# 复用 chat.py 的免验证 SSL 上下文（Agnes API 证书在部分环境下校验失败）
_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE

# 默认模型（与 protocol.py 一致）
DEFAULT_MODEL = "agnes-2.0-flash"


def llm_chat(
    api_key: str,
    api_base: str,
    messages: List[Dict],
    model: str = DEFAULT_MODEL,
    temperature: float = 0,
    max_tokens: int = 2000,
    system: Optional[str] = None,
    timeout: int = 120,
) -> str:
    """
    同步调用 LLM 的 /chat/completions（非流式），返回纯文本回复。

    供进化 / Deep Dream 等后台任务使用。失败时返回空串并记日志，不抛异常
    （后台任务不应因 LLM 失败而中断主流程）。

    Args:
        api_key: API Key
        api_base: API 基地址（如 https://apihub.agnes-ai.com/v1）
        messages: 对话消息列表
        model: 模型名
        temperature: 温度
        max_tokens: 最大输出 token
        system: 可选系统提示词（若提供，插入到 messages 最前）
        timeout: 超时秒数

    Returns:
        LLM 回复的纯文本；失败返回 ""
    """
    if not api_key or not api_base:
        logger.warning("llm_chat: api_key 或 api_base 为空，跳过调用")
        return ""

    full_messages = []
    if system:
        full_messages.append({"role": "system", "content": system})
    full_messages.extend(messages)

    body = {
        "model": model or DEFAULT_MODEL,
        "messages": full_messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }

    base = api_base.rstrip("/")
    url = f"{base}/chat/completions"

    def _post() -> str:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        req = urllib_req.Request(
            url,
            data=data,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib_req.urlopen(req, timeout=timeout, context=_SSL_CTX) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        choices = result.get("choices") or []
        if not choices:
            return ""
        return choices[0].get("message", {}).get("content", "") or ""

    try:
        return _post()
    except Exception as e:
        logger.warning(f"llm_chat 调用失败: {e}")
        return ""
