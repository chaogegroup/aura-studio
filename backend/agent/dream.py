"""
Deep Dream 记忆蒸馏服务
基于 CowAgent MemoryFlushManager / summarizer (MIT License, Copyright 2022 zhayujie)
适配 AURA Studio 的记忆系统

两件事：
1. summarize_to_daily：把一段对话用 LLM 归纳成事件级 daily 记录（按事件维度，非逐轮）
2. deep_dream：定期把近期 daily + 现有 core 记忆 LLM 蒸馏成精炼长期记忆 + 一篇梦境日记

这是让记忆"越用越聪明"而非"越堆越乱"的关键 —— 长期记忆会被持续合并、去重、提炼。
"""

import json
import time
import hashlib
import logging
from pathlib import Path
from datetime import datetime, timedelta
from typing import List, Dict, Optional

logger = logging.getLogger("aura-dream")


# ============ 摘要提示词（移植自 CowAgent summarizer.py） ============

SUMMARIZE_SYSTEM_PROMPT = """你是一个对话记录助手。请将对话内容归纳为当天的日常记录。

## 要求

按「事件」维度归纳发生的事，不要按对话轮次逐条记录：
- 每条一行，用 "- " 开头
- 合并同一件事的多轮对话
- 只记录有意义的事件，忽略闲聊和问候
- 保留关键的决策、结论和待办事项

当对话没有任何记录价值（仅含问候或无意义内容），直接回复"无"。"""

# ============ Deep Dream 蒸馏提示词（移植自 CowAgent summarizer.py） ============

DREAM_SYSTEM_PROMPT = """你是一个记忆整理助手，负责定期整理用户的长期记忆。

你将收到两份材料：
1. **当前长期记忆** — core.json 的现有内容
2. **近期日记** — 最近若干天的日常记录

core 记忆会注入每次对话的系统提示词中，因此必须保持精炼，只存放有价值和值得记忆的内容。

**重要：只能基于提供的材料进行整理，严禁编造、推测或添加材料中不存在的信息。**

## 任务

### Part 1: 更新后的长期记忆（[MEMORY]）

在现有记忆基础上进行整理和提炼，输出完整的更新后 JSON 内容：
- **合并提炼**：将含义相近的多条合并为一条高密度表述，而非简单罗列
- **新增萃取**：从近期日记中提取值得永久记住的新信息（偏好、决策、经验）
- **冲突更新**：当新信息与旧条目矛盾时，以新信息为准，替换旧条目
- **清理无效**：删除临时性记录、空白条目、无意义、重复内容
- **删除冗余**：已被更精炼表述涵盖的旧条目应删除，避免信息重复

输出一个 JSON 对象，结构与输入的 core 一致：
```
{"preferences": {"key": "值"}, "lessons": ["经验1", "经验2"]}
```
- preferences：用户偏好（key-value）
- lessons：经验教训（字符串数组，控制在 20 条以内）
如果没有可保留的内容，输出空对象 `{"preferences": {}, "lessons": []}`。

### Part 2: 梦境日记（[DREAM]）

用简洁的叙事风格写一篇短日记，记录这次整理的发现，保持格式美观易读：
- 发现了哪些重复或矛盾
- 从日记中提取了什么新洞察
- 做了哪些清理和优化
- 整体感受和观察

## 输出格式（严格遵守）

```
[MEMORY]
{"preferences": {...}, "lessons": [...]}

[DREAM]
梦境日记内容...
```"""

DREAM_USER_PROMPT = """## 当前长期记忆（core.json）

{memory_content}

## 近期日记（最近 {days} 天）

{daily_content}"""


class DeepDreamService:
    """
    Deep Dream 记忆蒸馏服务

    - summarize_to_daily: 对话 → 事件级 daily 摘要
    - deep_dream: 近期 daily + core → 精炼 core + 梦境日记
    """

    def __init__(self, memory_manager, api_key: str = "", api_base: str = "", model: str = ""):
        self.memory = memory_manager
        self.api_key = api_key
        self.api_base = api_base
        self.model = model or "agnes-2.0-flash"
        # 去重：同一天相同 daily 内容不重复蒸馏
        self._last_dream_input_hash = ""

    def set_credentials(self, api_key: str, api_base: str, model: str = ""):
        self.api_key = api_key
        self.api_base = api_base
        if model:
            self.model = model

    # ============ 对话摘要 → daily ============

    def summarize_to_daily(self, messages: List[Dict]) -> bool:
        """把一段对话用 LLM 归纳成事件级 daily 记录，写入 daily/<date>.json。

        Returns: 是否成功写入（LLM 判定无价值则不写）
        """
        if not self.api_key:
            logger.warning("DeepDream.summarize: no api_key, skip")
            return False

        conversation_text = self._format_conversation(messages)
        if not conversation_text.strip():
            return False

        from .llm_client import llm_chat
        summary = llm_chat(
            api_key=self.api_key,
            api_base=self.api_base,
            messages=[{"role": "user", "content": f"请归纳以下对话的日常记录：\n\n{conversation_text}"}],
            model=self.model,
            system=SUMMARIZE_SYSTEM_PROMPT,
            temperature=0,
            max_tokens=500,
        )
        summary = (summary or "").strip()

        # 空哨兵："无" / "None" / 空
        if not summary or summary in ("无", "None", "none"):
            logger.info("DeepDream.summarize: no valuable content, skip")
            return False

        if self.memory:
            self.memory.add_daily_summary(summary)
            logger.info(f"DeepDream.summarize: wrote daily summary ({len(summary)} chars)")
        return True

    @staticmethod
    def _format_conversation(messages: List[Dict]) -> str:
        """把消息格式化成可读对话文本供 LLM 摘要。"""
        lines = []
        for msg in messages:
            role = msg.get("role", "")
            content = msg.get("content", "")
            text = _extract_text(content)
            if not text.strip():
                continue
            text = text.strip()[:500]
            if role == "user":
                lines.append(f"用户: {text}")
            elif role == "assistant":
                lines.append(f"助手: {text}")
        return "\n".join(lines)

    # ============ Deep Dream 蒸馏 ============

    def deep_dream(self, lookback_days: int = 1, force: bool = False) -> Dict:
        """蒸馏近期 daily + core → 精炼 core + 梦境日记。

        Args:
            lookback_days: 回看多少天的 daily（默认 1）
            force: 跳过去重检查（手动触发时用）

        Returns:
            {"ok": bool, "message": str, "dream_diary": str}
        """
        if not self.api_key:
            return {"ok": False, "message": "未配置 API Key，无法蒸馏"}
        if not self.memory:
            return {"ok": False, "message": "记忆系统未初始化"}

        logger.info(f"[DeepDream] starting distillation (lookback={lookback_days} days)")

        # 收集材料
        memory_content = self._read_core_text()
        daily_content, has_content = self._read_recent_dailies(lookback_days)

        if not has_content:
            return {"ok": False, "message": "近期没有 daily 记录，跳过蒸馏以保护现有 core 记忆"}

        # 去重：相同 daily 内容同一天不重复蒸馏
        daily_hash = hashlib.md5(daily_content.encode("utf-8")).hexdigest()
        today_str = datetime.now().strftime("%Y-%m-%d")
        dedup_key = f"{today_str}:{daily_hash}"
        if not force and dedup_key == self._last_dream_input_hash:
            return {"ok": False, "message": "今天的 daily 内容已蒸馏过，跳过"}
        self._last_dream_input_hash = dedup_key

        # 调 LLM 蒸馏
        from .llm_client import llm_chat
        user_msg = DREAM_USER_PROMPT.format(
            memory_content=memory_content or "(空)",
            days=lookback_days,
            daily_content=daily_content or "(无近期 daily 记录)",
        )
        raw = llm_chat(
            api_key=self.api_key,
            api_base=self.api_base,
            messages=[{"role": "user", "content": user_msg}],
            model=self.model,
            system=DREAM_SYSTEM_PROMPT,
            temperature=0.3,
            max_tokens=2000,
            timeout=120,
        )
        if not raw or not raw.strip():
            return {"ok": False, "message": "LLM 返回空，蒸馏失败"}

        # 解析 [MEMORY] / [DREAM]
        new_memory_json, dream_diary = self._parse_dream_output(raw)

        if not new_memory_json:
            logger.warning("[DeepDream] 输出无 [MEMORY] 段，跳过覆盖")
            return {"ok": False, "message": "LLM 输出无 [MEMORY] 段，未更新"}

        # 更新 core 记忆
        try:
            old_core = self.memory.get_core_memory()
            # 保留非蒸馏管理的字段（如 updated_at），用 LLM 产出的 preferences/lessons 覆盖
            new_core = dict(old_core)
            new_core["preferences"] = new_memory_json.get("preferences", {})
            new_core["lessons"] = new_memory_json.get("lessons", [])
            new_core["updated_at"] = time.time()
            new_core["last_dream"] = today_str
            self.memory.save_core_memory(new_core)
            logger.info(
                f"[DeepDream] updated core: "
                f"{len(old_core.get('preferences', {}))}→{len(new_core['preferences'])} prefs, "
                f"{len(old_core.get('lessons', []))}→{len(new_core['lessons'])} lessons"
            )
        except Exception as e:
            logger.error(f"[DeepDream] 写入 core 失败: {e}")
            return {"ok": False, "message": f"写入 core 失败: {e}"}

        # 写梦境日记
        if dream_diary:
            self._write_dream_diary(dream_diary)

        logger.info("[DeepDream] ✅ distillation completed")
        return {
            "ok": True,
            "message": "蒸馏完成",
            "dream_diary": dream_diary[:500] if dream_diary else "",
            "preferences": len(new_core["preferences"]),
            "lessons": len(new_core["lessons"]),
        }

    def _read_core_text(self) -> str:
        """读现有 core 记忆并格式化成文本。"""
        try:
            core = self.memory.get_core_memory()
            if not core:
                return ""
            prefs = core.get("preferences", {})
            lessons = core.get("lessons", [])
            parts = []
            if prefs:
                parts.append("偏好:")
                for k, v in prefs.items():
                    parts.append(f"  - {k}: {v}")
            if lessons:
                parts.append("经验教训:")
                for l in lessons:
                    parts.append(f"  - {l}")
            return "\n".join(parts) if parts else "(空)"
        except Exception as e:
            logger.warning(f"[DeepDream] 读 core 失败: {e}")
            return ""

    def _read_recent_dailies(self, lookback_days: int) -> tuple:
        """读最近 N 天的 daily 记录。返回 (合并文本, 是否有内容)。"""
        parts = []
        has_content = False
        today = datetime.now().date()
        for offset in range(lookback_days):
            day = today - timedelta(days=offset)
            date_str = day.strftime("%Y-%m-%d")
            daily_file = self.memory.daily_dir / f"{date_str}.json"
            if daily_file.exists():
                try:
                    entries = json.loads(daily_file.read_text(encoding="utf-8"))
                    if entries:
                        texts = [e.get("summary", "") for e in entries if e.get("summary")]
                        if texts:
                            parts.append(f"### {date_str}\n" + "\n".join(f"- {t}" for t in texts))
                            has_content = True
                except Exception:
                    pass
        return "\n\n".join(parts), has_content

    @staticmethod
    def _parse_dream_output(raw: str) -> tuple:
        """解析 LLM 输出为 (core_memory_dict, dream_diary_text)。"""
        raw = raw.strip().replace("```", "")
        new_memory_json = {}
        dream_diary = ""

        if "[MEMORY]" in raw:
            start = raw.index("[MEMORY]") + len("[MEMORY]")
            end = raw.index("[DREAM]") if "[DREAM]" in raw else len(raw)
            mem_text = raw[start:end].strip()
            # 尝试解析 JSON
            try:
                new_memory_json = json.loads(mem_text)
            except json.JSONDecodeError:
                # 容错：提取第一个 JSON 对象
                import re
                m = re.search(r"\{.*\}", mem_text, re.DOTALL)
                if m:
                    try:
                        new_memory_json = json.loads(m.group(0))
                    except json.JSONDecodeError:
                        logger.warning(f"[DeepDream] [MEMORY] 段 JSON 解析失败: {mem_text[:100]}")

        if "[DREAM]" in raw:
            start = raw.index("[DREAM]") + len("[DREAM]")
            dream_diary = raw[start:].strip()

        return new_memory_json, dream_diary

    def _write_dream_diary(self, content: str):
        """写梦境日记到 memory/dreams/<date>.md"""
        dreams_dir = self.memory.memory_dir / "dreams"
        dreams_dir.mkdir(parents=True, exist_ok=True)
        today = datetime.now().strftime("%Y-%m-%d")
        diary_file = dreams_dir / f"{today}.md"
        diary_file.write_text(f"# 梦境日记: {today}\n\n{content}\n", encoding="utf-8")
        logger.info(f"[DeepDream] wrote dream diary to {diary_file}")

    def list_dream_diaries(self, limit: int = 10) -> List[Dict]:
        """列出最近的梦境日记（前端展示用）。"""
        dreams_dir = self.memory.memory_dir / "dreams" if self.memory else None
        if not dreams_dir or not dreams_dir.exists():
            return []
        result = []
        for f in sorted(dreams_dir.glob("*.md"), reverse=True)[:limit]:
            try:
                content = f.read_text(encoding="utf-8")
                result.append({
                    "date": f.stem,
                    "content": content[:1000],
                    "path": str(f),
                })
            except Exception:
                pass
        return result


def _extract_text(content) -> str:
    """从消息 content（字符串或多模态块）提取纯文本。"""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
            elif isinstance(block, str):
                parts.append(block)
        return "\n".join(parts)
    return ""
