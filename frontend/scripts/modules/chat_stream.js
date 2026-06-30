// ========== Chat Stream Module ==========
// sendChatMessage and related functions
// NOTE: These functions will be registered globally only if they don't already exist
// to avoid conflicts with the monolithic app.js

function handleChatKey(event) {
 if (event.key === 'Enter' && !event.shiftKey) {
  event.preventDefault();
  sendChatMessage();
 }
}

// 全局：Agent 输出的 AbortController（用于打断）
let agentAbortController = null;

// 发送按钮点击：运行中则打断，否则发送
function handleSendClick() {
 const btnText = document.getElementById('btnSendText');
 if (btnText && btnText.textContent === '停止') {
  // 正在输出，打断
  stopGeneration();
  return;
 }
 sendChatMessage();
}

async function sendChatMessage() {
 const inputEl = document.getElementById('chatInput');
 const btnSend = document.getElementById('btnSend');
 const btnText = document.getElementById('btnSendText');
 const btnSpinner = document.getElementById('btnSendSpinner');
 const userText = inputEl.value.trim();
 const hasImage = !!chatImageDataUrl;
 if (!userText && !hasImage) return;

 inputEl.value = '';
 inputEl.style.height = 'auto';
 btnSend.disabled = false; // 保持可点击（用于打断）
 btnText.textContent = '停止';
 btnText.style.display = '';
 btnSpinner.style.display = 'inline-block';

 // Build user message content (supports multi-modal)
 let userContent;
 if (hasImage) {
  userContent = [];
  if (userText) userContent.push({ type: 'text', text: userText });
  userContent.push({ type: 'image_url', image_url: { url: chatImageDataUrl } });
  removeChatImage(); // clear preview after read
 } else {
  userContent = userText;
 }

 // Add user message
 chatMessages.push({ role: 'user', content: userContent });
 // 自动命名会话
 const session = sessions.find(s => s.id === currentSessionId);
 if (session && session.name === '新对话' && userContent) {
  session.name = autoSessionName(userContent);
  saveSessions();
  renderSessionDirectory();
 }
 saveChatHistory();
 trimChatHistory(); // 安全时机：流式开始前截断旧消息
 renderChatMessages();

	 // === Agent 模式：始终使用 ===
	 const stepsContainer = document.getElementById("agentSteps");
	 if (stepsContainer) {
	  stepsContainer.classList.add("visible");
	 }
	 window.AgentUI.clearSteps();

		 try {
		  window.AgentUI.setRunning(true);

		  // 先 push assistant 占位消息，显示"思考中"动画
		  chatMessages.push({ role: 'assistant', content: '' });
		  renderChatMessages();
		  const thinkBubble = document.querySelector('.chat-msg.assistant:last-child .chat-bubble');
		  if (thinkBubble) {
		   thinkBubble.innerHTML = '<span class="chat-thinking"><span>正</span><span>在</span><span>思</span><span>考</span><span class="chat-thinking-dot">.</span><span class="chat-thinking-dot">.</span><span class="chat-thinking-dot">.</span></span>';
		  }

		  // 如果有图片，先上传到图床（Agnes 2.0 只接受公网 URL，不支持 base64）
		  let finalContent = userContent;
		  if (hasImage && typeof userContent === 'object' && Array.isArray(userContent)) {
		   const imgPart = userContent.find(p => p.type === 'image_url');
		   if (imgPart && imgPart.image_url && imgPart.image_url.url && imgPart.image_url.url.startsWith('data:')) {
		    showToast('正在上传图片…', 'info');
		    try {
		     const publicUrl = await uploadImageToCdn(imgPart.image_url.url);
		     if (publicUrl) {
		      imgPart.image_url.url = publicUrl;
		      const lastUserMsg = chatMessages[chatMessages.length - 2];
		      if (lastUserMsg && lastUserMsg.role === 'user' && Array.isArray(lastUserMsg.content)) {
		       const lastImg = lastUserMsg.content.find(p => p.type === 'image_url');
		       if (lastImg) lastImg.image_url.url = publicUrl;
		      }
		     }
		    } catch(e) { console.warn('Image upload failed, sending as base64 (may not work):', e); }
		   }
		  }

		  // 标记是否已开始正文（用于区分思考阶段和正文阶段）
		  let messagePhaseStarted = false;

		  // 创建 AbortController 用于打断
		  agentAbortController = new AbortController();

		  const agentResult = await window.AgentService.execute(
		    finalContent,
		    chatMessages.slice(0, -2), // 不包含占位 assistant 消息和刚添加的用户消息
	    function(event) {
	     // 处理 Agent 事件：思考过程和正文都追加到同一个 content，按顺序流式输出
	     if (event.type === 'reasoning_update') {
	      // 深度思考推理过程 - 直接追加到回复内容（灰色斜体标记）
	      const delta = event.data.content || event.data.delta || '';
	      if (delta) {
	       const lastMsg = chatMessages[chatMessages.length - 1];
	       if (lastMsg && lastMsg.role === 'assistant') {
	        // 用分隔标记包裹思考内容，渲染时区分
	        lastMsg.content += delta;
	       }
	       // 增量渲染（思考内容用灰色斜体显示）
	       const now = Date.now();
	       if (!window._agentLastRender || now - window._agentLastRender > 80) {
	        const bubble = document.querySelector('.chat-msg.assistant:last-child .chat-bubble');
	        if (bubble) {
	         const plain = chatMessages[chatMessages.length - 1].content || '';
	         // 思考阶段整体灰色斜体
	         bubble.innerHTML = '<em style="color:var(--text-muted);font-style:italic;">' + escapeHtml(plain) + '</em>';
	        }
	        const el = document.querySelector('.chat-msg:last-child');
	        if (el) el.scrollIntoView({ block: 'end' });
	        window._agentLastRender = now;
	       }
	      }
	     } else if (event.type === 'message_update') {
	      // 正文流式增量
	      const delta = event.data.delta;
	      if (delta) {
	       const lastMsg = chatMessages[chatMessages.length - 1];
	       if (lastMsg && lastMsg.role === 'assistant') {
	        // 正文开始时，如果有思考内容，加分隔线
	        if (!messagePhaseStarted && lastMsg.content && lastMsg.content.trim()) {
	         lastMsg.content = lastMsg.content.trimEnd() + '\n\n---\n\n';
	         messagePhaseStarted = true;
	        }
	        lastMsg.content += delta;
	       }
	       // 增量渲染：思考部分灰色斜体，分隔线后正文正常渲染
	       const now = Date.now();
	       if (!window._agentLastRender || now - window._agentLastRender > 80) {
	        const bubble = document.querySelector('.chat-msg.assistant:last-child .chat-bubble');
	        if (bubble) {
	         const plain = chatMessages[chatMessages.length - 1].content || '';
	         bubble.innerHTML = renderMixedContent(plain);
	        }
	        const el = document.querySelector('.chat-msg:last-child');
	        if (el) el.scrollIntoView({ block: 'end' });
	        window._agentLastRender = now;
	       }
	      }
	     } else if (event.type === 'message_end') {
	      // 最终回复 - 完整渲染
	      const content = event.data.content || '';
	      if (content) {
	       const lastMsg = chatMessages[chatMessages.length - 1];
	       if (lastMsg && lastMsg.role === 'assistant') {
	        // 如果有思考内容，保留思考 + 分隔线 + 正文
	        if (lastMsg.content && lastMsg.content.trim() && messagePhaseStarted) {
	         // 已有思考内容，拼接正文
	         lastMsg.content = lastMsg.content.split('\n\n---\n\n')[0] + '\n\n---\n\n' + content;
	        } else if (lastMsg.content && lastMsg.content.trim() && !messagePhaseStarted) {
	         // 只有思考没有正文（message_end 的 content 可能含完整正文）
	         lastMsg.content = lastMsg.content.trimEnd() + '\n\n---\n\n' + content;
	        } else {
	         lastMsg.content = content;
	        }
	       }
	       renderChatMessages();
	       saveChatHistory();
	      }
	     } else if (event.type === 'tool_call_start') {
	      window.AgentUI.renderStep({
	       type: 'tool_start',
	       tool: event.data.name,
	       args: event.data.arguments
	      });
	     } else if (event.type === 'tool_call_end') {
	      let result = {};
	      try {
	       result = JSON.parse(event.data.result || '{}');
	      } catch(e) {}
	      window.AgentUI.renderStep({
	       type: 'tool_end',
	       tool: event.data.name,
	       result: result
	      });
	     } else if (event.type === 'error') {
	      window.AgentUI.renderStep({
	       type: 'tool_error',
	       tool: 'agent',
	       error: event.data.error
	      });
	     }
		    }
		   , agentAbortController.signal);
	   saveChatHistory();
	  } catch (e) {
	   if (e.name === 'AbortError') {
	    // 用户打断，保留已生成内容
	    saveChatHistory();
	   } else {
	    console.error('Agent error:', e);
	    chatMessages.push({ role: 'assistant', content: '抱歉，Agent 执行出错: ' + e.message });
	    renderChatMessages();
	   }
	  } finally {
	   agentAbortController = null;
	   window.AgentUI.setRunning(false);
	   btnSend.disabled = false;
	   btnText.textContent = '发送';
	   btnText.style.display = '';
	   btnSpinner.style.display = 'none';
  }
  return; // Agent 模式始终使用，不走普通对话路径
 }

function stopGeneration() {
 if (agentAbortController) {
  agentAbortController.abort();
 }
 if (chatAbortController) {
  chatAbortController.abort();
 }
}

function clearChat() {
 const session = sessions.find(s => s.id === currentSessionId);
 if (!session || !session.messages.length) return;
 if (!confirm('清除当前会话的所有消息？')) return;
 session.messages = [];
 chatMessages = session.messages;
 saveSessions();
 renderChatMessages();
 renderSessionDirectory();
 showToast('会话已清除', 'success');
}

function exportChatHistory() {
 if (chatMessages.length === 0) {
  showToast('暂无对话内容', 'error');
  return;
 }
 const exportObj = {
  model: 'agnes-2.0-flash',
  exportedAt: new Date().toISOString(),
  systemPrompt: document.getElementById('chatSystemPrompt').value.trim() || null,
  messages: chatMessages
 };
 const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `agnes-chat-${new Date().toISOString().slice(0, 10)}.json`;
 a.click();
 URL.revokeObjectURL(url);
 showToast('对话已导出', 'success');
}

// ========== 图片上传辅助 ==========

/**
 * 将 base64 data URL 上传到图床，返回公网 URL。
 * Agnes 2.0 Flash 只接受公网可访问的图片 URL，不支持 base64。
 */
async function uploadImageToCdn(dataUrl) {
 if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl;
 // 转换 base64 为 Blob
 const resp = await fetch(dataUrl);
 const blob = await resp.blob();
 const ext = blob.type.split('/')[1] || 'png';
 const file = new File([blob], `chat_${Date.now()}.${ext}`, { type: blob.type });

 // 上传到 /api/upload
 const formData = new FormData();
 formData.append('file', file);
 const uploadResp = await fetch(API_HOST + '/api/upload', {
  method: 'POST',
  body: formData,
 });
 const result = await uploadResp.json();
 if (result.url) {
  console.log('[Upload] 图片已上传:', result.url);
  return result.url;
 }
 throw new Error('上传失败: ' + (result.error || '未知错误'));
}

/**
 * 渲染混合内容：思考部分（分隔线 --- 之前）灰色斜体，正文部分正常 Markdown 渲染。
 * 用于 Agent 流式输出时区分思考过程和正文。
 */
function renderMixedContent(text) {
 if (!text) return '';
 // 按分隔线 --- 拆分思考部分和正文部分
 const sep = '\n\n---\n\n';
 const idx = text.indexOf(sep);
 if (idx === -1) {
  // 还没有分隔线，全是思考内容
  return '<em style="color:var(--text-muted);font-style:italic;white-space:pre-wrap;">' + escapeHtml(text) + '</em>';
 }
 const reasoningPart = text.substring(0, idx);
 const contentPart = text.substring(idx + sep.length);
 let html = '<em style="color:var(--text-muted);font-style:italic;white-space:pre-wrap;">' + escapeHtml(reasoningPart) + '</em>';
 html += '<hr style="border:none;border-top:1px dashed var(--border);margin:8px 0;">';
 html += formatMessageContentString(contentPart);
 return html;
}
