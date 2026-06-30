/**
 * Agent 模块 - 前端 Agent 执行器
 * 调用后端 /api/agent/chat SSE 接口，解析 Agent 事件
 */

(function() {
  window.AgentService = {
    /**
     * 执行 Agent 对话
     * @param {string} message - 用户消息
     * @param {Array} history - 历史消息
     * @param {function} onEvent - 事件回调
     * @returns {Promise<string>} 最终回复
     */
    execute: async function(message, history, onEvent, signal) {
      const API_HOST = window.API_HOST || 'http://127.0.0.1:18922';

      try {
        const response = await fetch(`${API_HOST}/api/agent/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
	        body: JSON.stringify({
	            message: message,
	            session_id: 'default',
	            history: history || [],
	            max_tokens: parseInt(document.getElementById('chatMaxTokens')?.value) || 65536,
	            _api_key: window.apiKey || '',
	            enabled_skills: getEnabledSkillsList(),
	            model: window.selectedChatModel || '',
	            enable_thinking: document.getElementById('chatDeepThink')?.checked || false
	          }),
          signal: signal
        });

        if (!response.ok) {
          throw new Error(`Agent API error: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let result = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); // 保留未完成的行

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6));
                if (onEvent) {
                  onEvent(event);
                }
                if (event.type === 'message_end') {
                  result = event.data.content || '';
                }
              } catch (e) {
                console.warn('Failed to parse agent event:', e);
              }
            }
          }
        }

        return result;

      } catch (error) {
        // 用户主动打断（AbortError）不算错误，静默处理
        if (error.name === 'AbortError') {
          return result;
        }
        console.error('Agent execution failed:', error);
        if (onEvent) {
          onEvent({
            type: 'error',
            data: { error: error.message }
          });
        }
        throw error;
      }
    },

    /**
     * 获取记忆统计
     */
    getMemoryStats: async function() {
      const API_HOST = window.API_HOST || 'http://127.0.0.1:18922';
      try {
        const resp = await fetch(`${API_HOST}/api/agent/memory`);
        return await resp.json();
      } catch (e) {
        return { context_messages: 0, core_fields: 0, daily_files: 0 };
      }
    },

    /**
     * 搜索记忆
     */
    searchMemory: async function(query) {
      const API_HOST = window.API_HOST || 'http://127.0.0.1:18922';
      try {
        const resp = await fetch(`${API_HOST}/api/agent/memory/context`);
        const context = await resp.json();
        // 简单的本地搜索
        return context.filter(m =>
          (m.content || '').toLowerCase().includes(query.toLowerCase())
        );
      } catch (e) {
        return [];
      }
    },

    /**
     * 获取知识库统计
     */
    getKnowledgeStats: async function() {
      const API_HOST = window.API_HOST || 'http://127.0.0.1:18922';
      try {
        const resp = await fetch(`${API_HOST}/api/agent/knowledge`);
        return await resp.json();
      } catch (e) {
        return { total: 0 };
      }
    },

    /**
     * 获取知识图谱
     */
    getKnowledgeGraph: async function() {
      const API_HOST = window.API_HOST || 'http://127.0.0.1:18922';
      try {
        const resp = await fetch(`${API_HOST}/api/agent/knowledge/graph`);
        return await resp.json();
      } catch (e) {
        return { nodes: {}, edges: [] };
      }
    },

    /**
     * 搜索知识
     */
    searchKnowledge: async function(query) {
      const API_HOST = window.API_HOST || 'http://127.0.0.1:18922';
      try {
        const resp = await fetch(`${API_HOST}/api/agent/knowledge/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query })
        });
        return await resp.json();
      } catch (e) {
        return [];
      }
    },

    /**
     * 获取技能列表
     */
    getSkills: async function() {
      const API_HOST = window.API_HOST || 'http://127.0.0.1:18922';
      try {
        const resp = await fetch(`${API_HOST}/api/agent/skills`);
        return await resp.json();
      } catch (e) {
        return [];
      }
    },

    /**
     * 创建自定义技能
     */
    createSkill: async function(name, description, prompt, category) {
      const API_HOST = window.API_HOST || 'http://127.0.0.1:18922';
      try {
        const resp = await fetch(`${API_HOST}/api/agent/skills/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description, prompt, category })
        });
        return await resp.json();
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    /**
     * 触发自我进化
     */
    triggerEvolution: async function(messages) {
      const API_HOST = window.API_HOST || 'http://127.0.0.1:18922';
      try {
        const resp = await fetch(`${API_HOST}/api/agent/evolution/trigger`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages })
        });
        return await resp.json();
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
  };
})();
