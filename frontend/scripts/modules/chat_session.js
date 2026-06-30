function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function autoSessionName(text) {
  const str = typeof text === 'string' ? text : (Array.isArray(text) ? (text.find(p => p.type === 'text')?.text || '') : '');
  const cleaned = str.replace(/<[^>]*>/g, '').trim();
  return cleaned.length > 28 ? cleaned.slice(0, 26) + '…' : (cleaned || '新对话');
}

function loadSessions() {
  try {
    const saved = localStorage.getItem('aura_sessions');
    if (saved) {
      sessions = JSON.parse(saved);
      if (!Array.isArray(sessions) || sessions.length === 0) throw 'empty';
    } else {
      // 迁移旧数据
      const old = localStorage.getItem('agnes_chat_history');
      const msgs = old ? JSON.parse(old) : [];
      const name = msgs.length > 0 ? autoSessionName(msgs[0].content) : '新对话';
      sessions = [{ id: genId(), name: name, messages: msgs }];
    }
  } catch(e) {
    sessions = [{ id: genId(), name: '新对话', messages: [] }];
  }
  currentSessionId = sessions[0].id;
  chatMessages = sessions[0].messages;
  saveSessions();
}

function saveSessions() {
  try { localStorage.setItem('aura_sessions', JSON.stringify(sessions)); } catch(e) {}
}

function saveChatHistory() {
  // 仅保存，不截断。截断在安全时机由 trimChatHistory() 执行
  const session = sessions.find(s => s.id === currentSessionId);
  if (session) {
    saveSessions();
  }
}

function trimChatHistory() {
  // 仅在非流式输出时安全截断旧消息，避免破坏进行中的 assistantIdx
  const session = sessions.find(s => s.id === currentSessionId);
  if (session) {
    while (chatMessages.length > 500) chatMessages.shift();
    saveSessions();
  }
}

function newSession() {
  const id = genId();
  sessions.unshift({ id, name: '新对话', messages: [] });
  switchSession(id);
  saveSessions();
  renderSessionDirectory();
  renderChatMessages();
}

function switchSession(id) {
  const session = sessions.find(s => s.id === id);
  if (!session) return;
  currentSessionId = id;
  chatMessages = session.messages;
  renderSessionDirectory();
  renderChatMessages();
}

function deleteSession(id) {
  if (sessions.length <= 1) return;
  sessions = sessions.filter(s => s.id !== id);
  if (currentSessionId === id) switchSession(sessions[0].id);
  saveSessions();
  renderSessionDirectory();
}