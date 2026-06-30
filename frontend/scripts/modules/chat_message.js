function handleChatImage(input) {
 const file = input.files?.[0];
 if (!file) return;
 if (file.size > 20 * 1024 * 1024) {
  showToast('图片超过 20MB 限制', 'error');
  return;
 }
 const reader = new FileReader();
 reader.onload = (e) => {
  chatImageDataUrl = e.target.result;
  document.getElementById('chatPreviewImg').src = chatImageDataUrl;
  document.getElementById('chatImagePreview').style.display = 'flex';
 };
 reader.readAsDataURL(file);
 input.value = '';
}

function removeChatImage() {
 chatImageDataUrl = null;
 document.getElementById('chatImagePreview').style.display = 'none';
 document.getElementById('chatPreviewImg').src = '';
}

function renderChatMessages() {
 const container = document.getElementById('chatMessages');
 if (chatMessages.length === 0) {
 container.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:60px 20px;">
 <div style="font-size:40px;margin-bottom:12px;opacity:0.5;">💬</div>
 <div style="font-size:14px;margin-bottom:4px;">Agnes 2.0 Flash</div>
 <div style="font-size:12px;">256K 上下文 | 最大 65.5K tokens 输出 | 支持流式输出</div>
 <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">输入你的问题开始对话</div>
 </div>`;
 renderSessionDirectory();
 return;
 }
 container.innerHTML = chatMessages.map((m, i) => {
 const role = m.role === 'user' ? 'user' : 'assistant';
 const avatar = role === 'user' ? '👤' : '✨';
 const msgType = getMessageType(m.content);
 const tagPrefix = msgType === 'image' ? 'image' : 'text';
 const typeCount = chatMessages.slice(0, i + 1).filter(x => getMessageType(x.content) === msgType).length;
 const tag = '@' + tagPrefix + '#' + typeCount;
 const tagClass = msgType === 'image' ? 'image-tag' : 'text-tag';
 const content = formatMessageContent(m.content);
 const copyTextRaw = Array.isArray(m.content)
  ? (m.content.find(p => p.type === 'text')?.text || '')
  : (m.content || '');
 const copyBtn = role === 'assistant' ? `<button class="btn-copy" style="font-size:10px;padding:3px 8px;" onclick="copyText(event, '${encodeURIComponent(copyTextRaw)}')">📋</button>` : '';
 return `<div class="chat-msg ${role}" id="chat-msg-${i}">
 <div class="chat-avatar">${avatar}</div>
 <div style="min-width:0">
 <div class="chat-bubble">${content}</div>
 <div class="chat-msg-actions"><span class="msg-tag ${tagClass}" onclick="scrollToMessage(${i})">${tag}</span>${copyBtn}</div>
 </div>
 </div>`;
 }).join('');
 container.scrollTop = container.scrollHeight;
 renderSessionDirectory();
}

function getTagForIndex(idx) {
 const m = chatMessages[idx];
 if (!m) return '@text#0';
 const msgType = getMessageType(m.content);
 const prefix = msgType === 'image' ? 'image' : 'text';
 const count = chatMessages.slice(0, idx + 1).filter(x => getMessageType(x.content) === msgType).length;
 return '@' + prefix + '#' + count;
}

function copyText(event, text) {
 event.stopPropagation();
 navigator.clipboard.writeText(decodeURIComponent(text)).then(() => {
 showToast('已复制', 'success');
 }).catch(() => showToast('复制失败', 'error'));
}

// ========== SESSION DIRECTORY ==========
function getMessageType(content) {
 if (Array.isArray(content)) return content.some(p => p.type === 'image_url') ? 'image' : 'text';
 return 'text';
}

function getMessagePreview(content) {
 if (Array.isArray(content)) {
  const txt = content.find(p => p.type === 'text')?.text || '';
  const hasImg = content.some(p => p.type === 'image_url');
  if (hasImg && txt) return txt.slice(0, 25);
  if (hasImg) return '[图片]';
  return txt.slice(0, 30);
 }
 return (content || '').slice(0, 30);
}

function getMessageImageUrl(content) {
 if (Array.isArray(content)) {
  const imgPart = content.find(p => p.type === 'image_url');
  return imgPart?.image_url?.url || null;
 }
 return null;
}

function scrollToMessage(index) {
 const el = document.getElementById('chat-msg-' + index);
 if (el) {
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.style.transition = 'background 0.3s';
  el.style.background = 'rgba(77,140,252,0.08)';
  el.style.borderRadius = '8px';
  setTimeout(() => { el.style.background = ''; }, 800);
 }
}

function renderSessionDirectory() {
 const listEl = document.getElementById('leftbarList');
 const countEl = document.getElementById('leftbarCount');
 if (!listEl) return;

 if (sessions.length === 0) {
  listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:11px;">暂无会话</div>';
  if (countEl) countEl.textContent = '0';
  return;
 }

 if (countEl) countEl.textContent = String(sessions.length);

 listEl.innerHTML = sessions.map(s => {
  const isActive = s.id === currentSessionId;
  const msgCount = s.messages.length;
  const preview = msgCount > 0 ? getMessagePreview(s.messages[s.messages.length - 1].content) : '';

  return '<div class="leftbar-item' + (isActive ? ' active' : '') + '" onclick="switchSession(\'' + s.id + '\')" oncontextmenu="event.preventDefault();if(confirm(\'删除会话「' + escapeHtml(s.name) + '」？\'))deleteSession(\'' + s.id + '\')">'
   + '<span class="leftbar-tag" style="min-width:auto;font-size:10px;color:' + (isActive ? 'var(--accent-blue)' : 'var(--text-muted)') + ';">' + (isActive ? '▸' : ' ') + '</span>'
   + '<span class="leftbar-preview" style="font-weight:' + (isActive ? '600' : '400') + ';color:' + (isActive ? 'var(--text-primary)' : '') + '">' + escapeHtml(s.name) + '</span>'
   + '<span class="leftbar-role" style="font-size:9px;opacity:0.5;flex-shrink:0;">' + msgCount + '条</span>'
   + '</div>';
 }).join('');
}
