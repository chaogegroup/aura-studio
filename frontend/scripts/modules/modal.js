function openManual() {
 if (typeof window.aura !== 'undefined' && window.aura.openManual) {
  window.aura.openManual();
 } else {
  // 非 Electron 环境（浏览器开发模式）
  window.open('/docs/', '_blank');
 }
}

// ===== 欢迎引导 =====
function saveWelcomeKey() {
 var input = document.getElementById('welcomeKeyInput');
 var key = input.value.trim();
 if (!key) { showToast('请先输入 API Key', 'error'); return; }
 apiKey = key;
 localStorage.setItem('agnes_api_key', key);
 localStorage.setItem('aura_welcome_done', '1');
 document.getElementById('apiKeyInput').value = key;
 document.getElementById('welcomeOverlay').classList.remove('show');
 saveApiKey();
 showToast('🎉 欢迎使用 AURA Studio！', 'success');
 // 自动打开设置界面，引导配置又拍云
 showUcloudGuide();
}
function skipWelcome() {
 localStorage.setItem('aura_welcome_done', '1');
 document.getElementById('welcomeOverlay').classList.remove('show');
 // 跳过 API Key 后也要引导配置又拍云图床
 showUcloudGuide();
}
function showUcloudGuide() {
 setTimeout(function() {
   var settingsModal = document.getElementById('settingsOverlay');
   if (settingsModal) {
     settingsModal.classList.add('show');
     setTimeout(function() {
       var titles = document.querySelectorAll('.settings-section-title');
       for (var i = 0; i < titles.length; i++) {
         if (titles[i].textContent.indexOf('又拍云') !== -1) {
           titles[i].scrollIntoView({behavior: 'smooth', block: 'center'});
           titles[i].style.transition = 'all 0.5s';
           titles[i].style.color = 'var(--accent-blue)';
           titles[i].style.textShadow = '0 0 10px rgba(77,140,252,0.5)';
           setTimeout(function() {
             titles[i].style.color = '';
             titles[i].style.textShadow = '';
           }, 3000);
           break;
         }
       }
     }, 300);
   }
 }, 800);
}

// Restore video task polling
videoTasks.forEach(task => {
 if (task.status === 'queued' || task.status === 'in_progress') {
 startPolling(task.id, task.mode);
 }
});

// ========== API KEY ==========

// ========== IMAGE UPLOAD / SOURCE TOGGLE ==========

// Get image sources for API calls — returns array of URLs (either regular URLs or base64 data URLs)

// Get multi image sources from URL list or uploads

// ========== TABS ==========

// ========== CHAT / TEXT MODULE ==========
// ========== ABOUT DIALOG ==========
function showAbout() {
 document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('show'));
 document.getElementById('aboutOverlay').classList.add('show');
 }
function hideAbout(event) {
 if (!event || event.target === document.getElementById('aboutOverlay')) {
  document.getElementById('aboutOverlay').classList.remove('show');
 }
}

// ===== 统一设置面板 =====
async function showSettings() {
 document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('show'));
 document.getElementById('settingsOverlay').classList.add('show');
 try {
  const resp = await fetch(API_HOST + '/api/config/all');
  const d = await resp.json();
  if (document.getElementById('setPollSeconds')) document.getElementById('setPollSeconds').value = d.poll_seconds || 22;
  if (document.getElementById('setTimeoutMin')) document.getElementById('setTimeoutMin').value = d.timeout_min || 20;
  if (document.getElementById('setAk')) document.getElementById('setAk').value = d.upyun_ak || '';
  if (document.getElementById('setSk')) document.getElementById('setSk').value = d.upyun_sk || '';
  if (document.getElementById('setBucket')) document.getElementById('setBucket').value = d.upyun_bucket || '';
  if (document.getElementById('setDomain')) document.getElementById('setDomain').value = d.upyun_domain || '';
  if (document.getElementById('setEndpoint')) document.getElementById('setEndpoint').value = d.upyun_endpoint || 'https://s3.api.upyun.com';
 } catch(e) { console.warn('[Settings] load failed:', e); }
}
function hideSettings(event) {
 if (!event || event.target === document.getElementById('settingsOverlay')) {
  document.getElementById('settingsOverlay').classList.remove('show');
 }
}
async function saveAllSettings() {
 var msg = document.getElementById('settingsMsg');
 var btn = document.querySelector('#settingsOverlay .btn-generate');
 var data = {
  poll_seconds: parseInt(document.getElementById('setPollSeconds')?.value) || 22,
  timeout_min: parseInt(document.getElementById('setTimeoutMin')?.value) || 20,
  upyun_ak: document.getElementById('setAk')?.value?.trim() || '',
  upyun_sk: document.getElementById('setSk')?.value?.trim() || '',
  upyun_bucket: document.getElementById('setBucket')?.value?.trim() || '',
  upyun_domain: document.getElementById('setDomain')?.value?.trim() || '',
  upyun_endpoint: document.getElementById('setEndpoint')?.value?.trim() || 'https://s3.api.upyun.com',
 };
 msg.textContent = '保存中…';
 msg.style.color = 'var(--text-muted)';
 if (btn) btn.disabled = true;
 try {
  const resp = await fetch(API_HOST + '/api/config/all', {
   method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)
  });
  const result = await resp.json();
  if (result.ok) {
   msg.textContent = '✅ 全部设置已保存';
   msg.style.color = 'var(--accent-green)';
  } else {
   msg.textContent = '❌ ' + (result.message || '保存失败');
   msg.style.color = 'var(--accent-red)';
  }
 } catch(e) {
  msg.textContent = '❌ ' + e.message;
  msg.style.color = 'var(--accent-red)';
 }
 if (btn) btn.disabled = false;
}

// ========== SUBSCRIPTION DIALOG ==========
function showSub() {
 document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('show'));
 document.getElementById('subOverlay').classList.add('show');
}
function hideSub(event) {
 if (!event || event.target === document.getElementById('subOverlay')) {
  document.getElementById('subOverlay').classList.remove('show');
 }
}

// ===== API 配置面板 =====
async function openApiConfig() {
  const overlay = document.getElementById("apiConfigOverlay");
  if (!overlay) return;
  // Load current config
  await loadApiConfig();
  overlay.classList.add("show");
}

function hideApiConfig(e) {
  if (e && e.target !== document.getElementById("apiConfigOverlay")) return;
  const overlay = document.getElementById("apiConfigOverlay");
  if (overlay) overlay.classList.remove("show");
}

async function loadApiConfig() {
  try {
  const resp = await fetch(API_HOST + "/api/config/models");
  const data = await resp.json();
  const models = data.models || {};
  const apiBase = data.api_base || "https://apihub.agnes-ai.com/v1";

  // API Base
  const baseEl = document.getElementById("setApiBase");
  if (baseEl) baseEl.value = apiBase;

  // Chat
  const chat = models.chat || {};
  const chatModel = document.getElementById("setModelChat");
  const chatTemp = document.getElementById("setModelChatTemp");
  const chatMax = document.getElementById("setModelChatMax");
  if (chatModel) chatModel.value = chat.model || "agnes-2.0-flash";
  if (chatTemp) chatTemp.value = chat.temperature != null ? chat.temperature : 0.7;
  if (chatMax) chatMax.value = chat.max_tokens || 4096;

  // Image
  const imgModel = document.getElementById("setModelImage");
  if (imgModel) imgModel.value = (models.image || {}).model || "agnes-image-2.1-flash";

  // Video
  const vidModel = document.getElementById("setModelVideo");
  if (vidModel) vidModel.value = (models.video || {}).model || "agnes-video-v2.0";

  // Agent
  const agent = models.agent || {};
  const agentModel = document.getElementById("setModelAgent");
  const agentSteps = document.getElementById("setModelAgentSteps");
  const agentReasoning = document.getElementById("setModelAgentReasoning");
  const agentThinking = document.getElementById("setModelAgentThinking");
  if (agentModel) agentModel.value = agent.model || "agnes-2.0-flash";
  if (agentSteps) agentSteps.value = agent.max_steps || 20;
  if (agentReasoning) agentReasoning.value = agent.reasoning_effort || "high";
  if (agentThinking) agentThinking.checked = !!agent.enable_thinking;

  // Update status dot
  const dot = document.getElementById("apiStatusDot");
  if (dot) {
  dot.style.background = apiKey ? "var(--accent-green)" : "var(--accent-red)";
  dot.title = apiKey ? "API Key 已配置" : "API Key 未配置";
  }

  } catch (e) {
  console.warn("[API Config] load failed:", e);
  }
}

async function saveApiConfig() {
  try {
  const models = {
  chat: {
  model: document.getElementById("setModelChat")?.value || "agnes-2.0-flash",
  temperature: parseFloat(document.getElementById("setModelChatTemp")?.value) || 0.7,
  max_tokens: parseInt(document.getElementById("setModelChatMax")?.value) || 4096,
  },
  image: { model: document.getElementById("setModelImage")?.value || "agnes-image-2.1-flash" },
  video: { model: document.getElementById("setModelVideo")?.value || "agnes-video-v2.0" },
  agent: {
  model: document.getElementById("setModelAgent")?.value || "agnes-2.0-flash",
  max_steps: parseInt(document.getElementById("setModelAgentSteps")?.value) || 20,
  reasoning_effort: document.getElementById("setModelAgentReasoning")?.value || "high",
  enable_thinking: document.getElementById("setModelAgentThinking")?.checked || false,
  },
  };
  const api_base = document.getElementById("setApiBase")?.value || "https://apihub.agnes-ai.com/v1";

  const resp = await fetch(API_HOST + "/api/config/models", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ models, api_base }),
  });
  const data = await resp.json();
  if (data.ok) {
  if (window.showToast) window.showToast("API 配置已保存", "success");
  // Update display elements
  if (data.models) {
  const imgDisplay = document.getElementById("imgModelDisplay");
  if (imgDisplay) imgDisplay.textContent = data.models.image?.model || "agnes-image-2.1-flash";
  const chatDisplay = document.getElementById("chatModelDisplay");
  if (chatDisplay) chatDisplay.textContent = data.models.chat?.model || "agnes-2.0-flash";
  const imgInput = document.getElementById("imgT2iModel");
  if (imgInput) imgInput.value = data.models.image?.model || "agnes-image-2.1-flash";
  const chatInput = document.getElementById("chatModel");
  if (chatInput) chatInput.value = data.models.chat?.model || "agnes-2.0-flash";
  window.modelConfig = data.models;
  window.apiBase = data.api_base || "https://apihub.agnes-ai.com/v1";
  }
  hideApiConfig();
  } else {
  if (window.showToast) window.showToast("保存失败: " + (data.error || "未知错误"), "error");
  }
  } catch (e) {
  if (window.showToast) window.showToast("保存失败: " + e.message, "error");
  }
}

// ===== 模型配置面板 =====
async function showModelConfig() {
 document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('show'));
 const overlay = document.getElementById('modelConfigOverlay');
 if (!overlay) return;
 // 加载当前配置
 try {
  const resp = await fetch(API_HOST + '/api/config/models');
  const data = await resp.json();
  const models = data.models || {};
  const apiBase = data.api_base || 'https://apihub.agnes-ai.com/v1';
  if (document.getElementById('mcApiBase')) document.getElementById('mcApiBase').value = apiBase;
  // 文本模型
  const chat = models.chat || {};
  if (document.getElementById('mcChatModel')) document.getElementById('mcChatModel').value = chat.model || 'agnes-2.0-flash';
  if (document.getElementById('mcChatModels')) document.getElementById('mcChatModels').value = (chat.models || ['agnes-2.0-flash','agnes-1.5-flash']).join(', ');
  // 图片模型
  const img = models.image || {};
  if (document.getElementById('mcImageModel')) document.getElementById('mcImageModel').value = img.model || 'agnes-image-2.1-flash';
  if (document.getElementById('mcImageModels')) document.getElementById('mcImageModels').value = (img.models || ['agnes-image-2.1-flash']).join(', ');
  // 视频模型
  const vid = models.video || {};
  if (document.getElementById('mcVideoModel')) document.getElementById('mcVideoModel').value = vid.model || 'agnes-video-v2.0';
  if (document.getElementById('mcVideoModels')) document.getElementById('mcVideoModels').value = (vid.models || ['agnes-video-v2.0']).join(', ');
 } catch(e) { console.warn('[ModelConfig] load failed:', e); }
 overlay.classList.add('show');
}

function hideModelConfig(e) {
 if (e && e.target !== document.getElementById('modelConfigOverlay')) return;
 const overlay = document.getElementById('modelConfigOverlay');
 if (overlay) overlay.classList.remove('show');
}

async function saveModelConfig() {
 var msg = document.getElementById('modelConfigMsg');
 var data = {
  api_base: document.getElementById('mcApiBase')?.value?.trim() || 'https://apihub.agnes-ai.com/v1',
  models: {
   chat: {
    model: document.getElementById('mcChatModel')?.value?.trim() || 'agnes-2.0-flash',
    models: (document.getElementById('mcChatModels')?.value || '').split(',').map(s => s.trim()).filter(Boolean),
   },
   image: {
    model: document.getElementById('mcImageModel')?.value?.trim() || 'agnes-image-2.1-flash',
    models: (document.getElementById('mcImageModels')?.value || '').split(',').map(s => s.trim()).filter(Boolean),
   },
   video: {
    model: document.getElementById('mcVideoModel')?.value?.trim() || 'agnes-video-v2.0',
    models: (document.getElementById('mcVideoModels')?.value || '').split(',').map(s => s.trim()).filter(Boolean),
   },
  },
 };
 msg.textContent = '保存中…';
 msg.style.color = 'var(--text-muted)';
 try {
  const resp = await fetch(API_HOST + '/api/config/models', {
   method: 'POST',
   headers: {'Content-Type': 'application/json'},
   body: JSON.stringify(data),
  });
  const result = await resp.json();
  if (result.ok) {
   msg.textContent = '✅ 模型配置已保存';
   msg.style.color = 'var(--accent-green)';
   window.modelConfig = result.models || data.models;
   window.apiBase = data.api_base;
   if (window.showToast) window.showToast('模型配置已保存', 'success');
   setTimeout(hideModelConfig, 800);
  } else {
   msg.textContent = '❌ ' + (result.message || '保存失败');
   msg.style.color = 'var(--accent-red)';
  }
 } catch(e) {
  msg.textContent = '❌ ' + e.message;
  msg.style.color = 'var(--accent-red)';
 }
}
