"""
Agent 核心协议 - 多轮推理 + 工具调用循环
基于 CowAgent AgentStreamExecutor (MIT License, Copyright 2022 zhayujie)
适配 AURA Studio 的本地部署场景

稳定性能力：
- 上下文压缩 _trim_messages（历史工具结果截断 + 轮次限制 + token 估算裁剪）
- 溢出恢复 _aggressive_trim_for_overflow（激进截断 + 重试一次）
- 工具失败熔断 _check_consecutive_failures（5次相同参数停止 / 8次连续失败终止）
- 消息格式修复 _validate_and_fix_messages（修复孤立 tool_use/tool_result）
- 空响应重试 + max_steps 摘要
"""

import json
import time
import asyncio
import logging
from typing import List, Dict, Any, Optional, Callable, AsyncGenerator
from dataclasses import dataclass, field

logger = logging.getLogger("aura-agent")


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict


@dataclass
class AgentEvent:
    type: str
    data: dict = field(default_factory=dict)


class BaseTool:
    name: str = "base_tool"
    description: str = ""
    parameters: dict = {}

    def execute(self, params: dict) -> dict:
        raise NotImplementedError

    def get_schema(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters
            }
        }


class AgentProtocol:
    """
    Agent 核心协议
    实现多轮推理循环：LLM -> tool_calls -> 执行 -> 结果喂回 -> 循环
    """

    # 熔断阈值
    MAX_SAME_CALLS = 5
    MAX_CONSEC_FAIL = 8
    SUCCESS_STOP_HINT = 3

    def __init__(
        self,
        api_key: str,
        api_base: str = "https://apihub.agnes-ai.com/v1",
        model: str = "agnes-2.0-flash",
        tools: List[BaseTool] = None,
        system_prompt: str = None,
        max_steps: int = 100,
        max_tokens: int = 65536,
        temperature: float = 0,
        max_context_tokens: int = 50000,
        max_context_turns: int = 20,
        enable_thinking: bool = False,
    ):
        self.api_key = api_key
        self.api_base = api_base
        self.model = model
        self.tools = tools or []
        self.system_prompt = system_prompt or self._default_system_prompt()
        self.max_steps = max_steps
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.max_context_tokens = max_context_tokens
        self.max_context_turns = max_context_turns
        self.enable_thinking = enable_thinking
        self.messages: List[Dict] = []
        # 熔断状态
        self._tool_call_counts: Dict[str, int] = {}
        self._consecutive_failures: int = 0
        self._consecutive_successes: int = 0

    def _default_system_prompt(self) -> str:
        from datetime import datetime
        now = datetime.now().strftime("%Y-%m-%d %H:%M")
        return f"你是 AURA Studio 的 AI 创作助手，当前时间：{now}。\n\n你可以使用工具帮助用户完成多模态创作任务。用中文回复。\n\n如果工具返回了图片 URL，请在回复中用 ![描述](URL) 格式展示给用户，不要只放链接。\n\n如果工具返回了 video_id，请在回复中如实展示 video_id 的值，不要自行编造或简写任务 ID。"

    def get_tools_schema(self) -> list:
        return [tool.get_schema() for tool in self.tools]

    def get_tool_by_name(self, name: str) -> Optional[BaseTool]:
        for tool in self.tools:
            if tool.name == name:
                return tool
        return None

    # ============ 上下文管理 ============

    @staticmethod
    def _estimate_tokens(messages: List[Dict]) -> int:
        total = 0
        for m in messages:
            content = m.get("content")
            if isinstance(content, str):
                total += len(content)
            elif isinstance(content, list):
                for part in content:
                    if isinstance(part, dict):
                        total += len(str(part.get("text", "")))
                        total += len(str(part.get("image_url", ""))) // 4
            if "tool_calls" in m:
                total += len(json.dumps(m["tool_calls"], ensure_ascii=False))
        return max(1, int(total / 3.5))

    @staticmethod
    def _content_str(content) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = []
            for p in content:
                if isinstance(p, dict) and p.get("type") == "text":
                    parts.append(p.get("text", ""))
            return " ".join(parts)
        return ""

    def _truncate_tool_results(self, messages: List[Dict], limit: int = 20000, hard_limit: int = 10000) -> List[Dict]:
        tool_seen = 0
        for m in messages:
            if m.get("role") == "tool":
                tool_seen += 1
        keep_recent = 3
        idx_from_end = 0
        for m in reversed(messages):
            if m.get("role") == "tool":
                idx_from_end += 1
                content = m.get("content", "")
                if isinstance(content, str) and idx_from_end > keep_recent:
                    if len(content) > limit:
                        m["content"] = content[:limit] + f"\n...[已截断，原始 {len(content)} 字符]"
        return messages

    def _trim_messages(self) -> None:
        if len(self.messages) <= 2:
            return
        self.messages = self._truncate_tool_results(self.messages, limit=20000)
        turns = sum(1 for m in self.messages if m.get("role") == "user")
        if turns > self.max_context_turns:
            system_msgs = [m for m in self.messages if m.get("role") == "system"]
            non_system = [m for m in self.messages if m.get("role") != "system"]
            keep_count = int(len(non_system) * 0.6)
            self.messages = system_msgs + non_system[-keep_count:]
        est = self._estimate_tokens(self.messages)
        if est > self.max_context_tokens:
            system_msgs = [m for m in self.messages if m.get("role") == "system"]
            non_system = [m for m in self.messages if m.get("role") != "system"]
            protect_from = len(non_system)
            for i in range(len(non_system) - 1, -1, -1):
                if non_system[i].get("role") == "user":
                    protect_from = i
                    break
            while protect_from > 0 and self._estimate_tokens(system_msgs + non_system) > self.max_context_tokens:
                non_system.pop(0)
                protect_from -= 1
            self.messages = system_msgs + non_system

    def _aggressive_trim_for_overflow(self) -> None:
        for m in self.messages:
            if m.get("role") == "tool":
                content = m.get("content", "")
                if isinstance(content, str) and len(content) > 10000:
                    m["content"] = content[:10000] + "\n...[溢出截断]"
        for m in self.messages:
            if m.get("role") == "user":
                content = m.get("content")
                if isinstance(content, str) and len(content) > 8000:
                    m["content"] = content[:8000] + "\n...[用户消息截断]"
        system_msgs = [m for m in self.messages if m.get("role") == "system"]
        non_system = [m for m in self.messages if m.get("role") != "system"]
        user_indices = [i for i, m in enumerate(non_system) if m.get("role") == "user"]
        if len(user_indices) >= 5:
            cut = user_indices[-5]
            non_system = non_system[cut:]
        self.messages = system_msgs + non_system

    def _validate_and_fix_messages(self) -> None:
        valid_tool_ids = set()
        for m in self.messages:
            if m.get("role") == "assistant" and m.get("tool_calls"):
                for tc in m["tool_calls"]:
                    tc_id = tc.get("id")
                    if tc_id:
                        valid_tool_ids.add(tc_id)
        fixed = []
        for m in self.messages:
            if m.get("role") == "tool":
                tcid = m.get("tool_call_id")
                if tcid and tcid not in valid_tool_ids:
                    continue
            fixed.append(m)
        for m in fixed:
            if m.get("role") == "assistant" and m.get("tool_calls") is None:
                m.pop("tool_calls", None)
        self.messages = fixed

    # ============ 工具失败熔断 ============

    def _check_circuit_breaker(self, tool_name: str, tool_args: dict) -> Optional[str]:
        key = f"{tool_name}:{json.dumps(tool_args, sort_keys=True, ensure_ascii=False)}"
        count = self._tool_call_counts.get(key, 0)
        if count >= self.MAX_SAME_CALLS:
            return f"工具 {tool_name} 已用相同参数调用 {count} 次，已停止该调用以避免死循环"
        return None

    def _record_tool_result(self, tool_name: str, tool_args: dict, success: bool) -> Optional[str]:
        key = f"{tool_name}:{json.dumps(tool_args, sort_keys=True, ensure_ascii=False)}"
        self._tool_call_counts[key] = self._tool_call_counts.get(key, 0) + 1
        if success:
            self._consecutive_failures = 0
            self._consecutive_successes += 1
        else:
            self._consecutive_failures += 1
            self._consecutive_successes = 0
            if self._consecutive_failures >= self.MAX_CONSEC_FAIL:
                return f"连续 {self._consecutive_failures} 次工具调用失败，终止对话"
        return None

    # ============ 主循环 ============

    async def execute(self, user_message: str, on_event: Callable = None, history: List[Dict] = None) -> str:
        async for event in self.execute_stream(user_message, on_event=on_event, history=history):
            if event.type == "message_end":
                return event.data.get("content", "")
            elif event.type == "error":
                return f"抱歉，AI 调用失败: {event.data.get('error', '未知错误')}"
        return ""

    async def execute_stream(self, user_message: str, on_event: Callable = None, history: List[Dict] = None) -> AsyncGenerator[AgentEvent, None]:
        self.messages = history or []
        if self.system_prompt:
            has_system = any(m.get("role") == "system" for m in self.messages)
            if not has_system:
                self.messages.insert(0, {"role": "system", "content": self.system_prompt})
        self.messages.append({"role": "user", "content": user_message})

        self._tool_call_counts = {}
        self._consecutive_failures = 0
        self._consecutive_successes = 0

        tools_schema = self.get_tools_schema() if self.tools else None
        step = 0
        overflow_retried = False
        empty_retried = False

        while step < self.max_steps:
            step += 1
            content = ""
            tool_calls_raw = []
            llm_error = None

            self._validate_and_fix_messages()
            self._trim_messages()

            try:
                async for chunk in self._call_llm_stream(tools_schema):
                    if chunk.get("type") == "delta":
                        delta = chunk.get("content", "")
                        if delta:
                            content += delta
                            evt = AgentEvent(type="message_update", data={"delta": delta, "step": step})
                            if on_event:
                                await on_event(evt)
                            yield evt
                    elif chunk.get("type") == "reasoning_update":
                        # 深度思考推理过程 - 透传给前端展示
                        reasoning = chunk.get("content", "")
                        if reasoning:
                            evt = AgentEvent(type="reasoning_update", data={"content": reasoning, "step": step})
                            if on_event:
                                await on_event(evt)
                            yield evt
                    elif chunk.get("type") == "tool_calls":
                        tool_calls_raw = chunk.get("tool_calls", [])
                    elif chunk.get("type") == "error":
                        llm_error = chunk.get("message", "LLM call failed")
            except Exception as e:
                llm_error = str(e)

            if llm_error and self._is_overflow_error(llm_error) and not overflow_retried:
                self._aggressive_trim_for_overflow()
                overflow_retried = True
                step -= 1
                continue

            # 限流（429/rate limit）：不同供应商机制不同（agnes 1分钟窗口、sensenova 5小时窗口），
            # 重试可能长时间卡住用户，因此直接报错让用户感知，不自动重试。
            if llm_error:
                # 限流错误加友好提示
                if self._is_rate_limit_error(llm_error):
                    llm_error = f"API 限流（429）：{llm_error}\n\n不同供应商限额恢复时间不同：agnes 约1分钟，商汤 sensenova 约5小时。请稍后再试或切换模型。"
                evt = AgentEvent(type="error", data={"error": llm_error, "step": step})
                if on_event:
                    await on_event(evt)
                yield evt
                return

            overflow_retried = False

            if not content and not tool_calls_raw:
                if not empty_retried:
                    self.messages.append({"role": "assistant", "content": ""})
                    self.messages.append({"role": "user", "content": "（请向用户回复你的结果，不要留空）"})
                    empty_retried = True
                    step -= 1
                    continue
                else:
                    self.messages.append({"role": "assistant", "content": content})
                    evt = AgentEvent(type="message_end", data={"content": "(空响应)", "step": step})
                    if on_event:
                        await on_event(evt)
                    yield evt
                    return
            empty_retried = False

            if not tool_calls_raw:
                self.messages.append({"role": "assistant", "content": content})
                evt = AgentEvent(type="message_end", data={"content": content, "step": step})
                if on_event:
                    await on_event(evt)
                yield evt
                return

            self.messages.append({
                "role": "assistant", "content": content or None,
                "tool_calls": tool_calls_raw
            })

            for tc_raw in tool_calls_raw:
                tc_id = tc_raw.get("id", "")
                func = tc_raw.get("function", {})
                tool_name = func.get("name", "")
                tool_args_str = func.get("arguments", "{}")
                try:
                    tool_args = json.loads(tool_args_str) if isinstance(tool_args_str, str) else tool_args_str
                except json.JSONDecodeError:
                    tool_args = {}

                evt = AgentEvent(type="tool_call_start", data={"id": tc_id, "name": tool_name, "arguments": tool_args, "step": step})
                if on_event:
                    await on_event(evt)
                yield evt

                block_reason = self._check_circuit_breaker(tool_name, tool_args)
                if block_reason:
                    result_str = json.dumps({"error": block_reason}, ensure_ascii=False)
                    self._record_tool_result(tool_name, tool_args, success=False)
                else:
                    tool = self.get_tool_by_name(tool_name)
                    if tool:
                        try:
                            result = await asyncio.to_thread(tool.execute, tool_args)
                            result_str = json.dumps(result, ensure_ascii=False)
                            is_success = not (isinstance(result, dict) and result.get("error"))
                        except Exception as e:
                            result_str = json.dumps({"error": str(e)})
                            is_success = False
                    else:
                        result_str = json.dumps({"error": f"Unknown tool: {tool_name}"})
                        is_success = False
                    terminate_reason = self._record_tool_result(tool_name, tool_args, success=is_success)
                    if terminate_reason:
                        evt = AgentEvent(type="tool_call_end", data={"id": tc_id, "name": tool_name, "result": result_str, "step": step})
                        if on_event:
                            await on_event(evt)
                        yield evt
                        self.messages.append({"role": "tool", "tool_call_id": tc_id, "content": result_str})
                        err_evt = AgentEvent(type="error", data={"error": terminate_reason, "step": step})
                        if on_event:
                            await on_event(err_evt)
                        yield err_evt
                        return

                evt = AgentEvent(type="tool_call_end", data={"id": tc_id, "name": tool_name, "result": result_str, "step": step})
                if on_event:
                    await on_event(evt)
                yield evt

                self.messages.append({"role": "tool", "tool_call_id": tc_id, "content": result_str})

        self.messages.append({"role": "user", "content": "（已达到最大执行步数，请向用户总结当前进展，不要再调用工具）"})
        summary = ""
        try:
            async for chunk in self._call_llm_stream(None):
                if chunk.get("type") == "delta":
                    delta = chunk.get("content", "")
                    if delta:
                        summary += delta
                        evt = AgentEvent(type="message_update", data={"delta": delta, "step": step})
                        if on_event:
                            await on_event(evt)
                        yield evt
        except Exception:
            pass
        evt = AgentEvent(type="max_steps_reached", data={"max_steps": self.max_steps, "summary": summary})
        if on_event:
            await on_event(evt)
        yield evt
        end_evt = AgentEvent(type="message_end", data={"content": summary or "已达到最大执行步数", "step": step})
        if on_event:
            await on_event(end_evt)
        yield end_evt

    @staticmethod
    def _is_overflow_error(msg: str) -> bool:
        if not msg:
            return False
        low = msg.lower()
        keywords = ["context length", "context window", "maximum context", "too long",
                    "token limit", "context_length_exceeded", "over the limit",
                    "上下文", "超出长度", "token 数", "max_tokens"]
        return any(k in low for k in keywords)

    @staticmethod
    def _is_rate_limit_error(msg: str) -> bool:
        """判断错误是否为限流（429 / rate limit / tpm / rpm），可等待后重试"""
        if not msg:
            return False
        low = msg.lower()
        keywords = ["429", "rate limit", "rate_limit", "too many requests",
                    "tpm", "rpm", "quota", "limit exceeded", "频率", "限流"]
        return any(k in low for k in keywords)

    async def _call_llm_stream(self, tools_schema: list) -> AsyncGenerator[dict, None]:
        import httpx

        payload = {
            "model": self.model,
            "messages": self.messages,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "stream": True,
        }
        if tools_schema:
            payload["tools"] = tools_schema
            payload["tool_choice"] = "auto"
        # enable_thinking 仅对 agnes 模型生效（chat_template_kwargs 是 agnes 专属参数）
        # 第三方模型（deepseek/glm 等）不认此参数，且会额外消耗 token 加重限流
        if self.enable_thinking and "agnes" in self.model.lower():
            payload["chat_template_kwargs"] = {"enable_thinking": True}

        try:
            async with httpx.AsyncClient(verify=False, timeout=300) as client:
                async with client.stream("POST", f"{self.api_base}/chat/completions", json=payload,
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}) as resp:

                    if resp.status_code != 200:
                        err = await resp.aread()
                        yield {"type": "error", "message": f"HTTP {resp.status_code}: {err[:300].decode('utf-8', errors='replace')}"}
                        return

                    buffer = ""
                    tool_calls_buffer = []
                    async for chunk_bytes in resp.aiter_bytes():
                        buffer += chunk_bytes.decode("utf-8", errors="replace")
                        lines = buffer.split("\n")
                        buffer = lines.pop()
                        for line in lines:
                            line = line.strip()
                            if not line or not line.startswith("data: "):
                                continue
                            json_str = line[6:].strip()
                            if json_str == "[DONE]":
                                continue
                            try:
                                data = json.loads(json_str)
                            except json.JSONDecodeError:
                                continue

                            choices = data.get("choices") or []
                            if not choices:
                                continue
                            choice = choices[0]

                            delta = choice.get("delta", {})
                            finish_reason = choice.get("finish_reason")

                            content = delta.get("content")
                            if content:
                                yield {"type": "delta", "content": content}

                            tc = delta.get("tool_calls")
                            if tc:
                                for t in tc:
                                    idx = t.get("index", 0)
                                    while len(tool_calls_buffer) <= idx:
                                        tool_calls_buffer.append({"id": "", "type": "function", "function": {"name": "", "arguments": ""}})
                                    if t.get("id"):
                                        tool_calls_buffer[idx]["id"] = t["id"]
                                    if t.get("function"):
                                        fn = t["function"]
                                        if fn.get("name"):
                                            tool_calls_buffer[idx]["function"]["name"] = fn["name"]
                                        if fn.get("arguments"):
                                            tool_calls_buffer[idx]["function"]["arguments"] += fn["arguments"]

                            reasoning = delta.get("reasoning_content")
                            if reasoning:
                                yield {"type": "reasoning_update", "content": reasoning}

                            if finish_reason:
                                if tool_calls_buffer:
                                    yield {"type": "tool_calls", "tool_calls": tool_calls_buffer}
                                break
        except httpx.TimeoutException:
            yield {"type": "error", "message": "LLM request timed out after 300s"}
        except Exception as e:
            logger.error(f"LLM stream call failed: {e}")
            yield {"type": "error", "message": str(e)}