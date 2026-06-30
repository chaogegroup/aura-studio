// ========== PROMPT TEMPLATES ==========
function applyTemplate(inputId, text) {
 document.getElementById(inputId).value = text;
 document.getElementById(inputId).focus();
 showToast('📝 已应用模板', 'success');
}

// ========== PROMPT AUTO-TRANSLATE ==========
function hasChinese(text) { return /[\u4e00-\u9fff]/.test(text); }

async function autoTranslatePrompt(text) {
 if (!text || !hasChinese(text)) return text;
 // Use AI to translate Chinese prompt to English
 try {
  const resp = await fetch(API_HOST + '/api/chat/completions', {
   method: 'POST',
   headers: {'Content-Type': 'application/json'},
   body: JSON.stringify({
    _api_key: apiKey,
    model: 'agnes-2.0-flash',
    messages: [
     { role: 'system', content: 'You are a professional prompt translator. Translate the user\'s Chinese prompt to high-quality English. Keep the exact meaning, add necessary details for better AI generation results. Return ONLY the English translation, no explanations.' },
     { role: 'user', content: text }
    ],
    temperature: 0.3,
    max_tokens: 500
   })
  });
  if (!resp.ok) return text;
  const data = await resp.json();
  const translated = data.choices?.[0]?.message?.content?.trim();
  return translated || text;
 } catch (e) {
  console.warn('[Translate] failed:', e);
  return text;
 }
}

// ========== SIZE PRESETS ==========
function selectSize(inputId, value, btn) {
 var hidden = document.getElementById(inputId);
 if (hidden) hidden.value = value;
 var parent = btn.closest('.size-presets') || btn.parentElement.parentElement;
 parent.querySelectorAll('.size-btn').forEach(function(b) { b.classList.remove('active'); });
 btn.classList.add('active');
}

// ========== STATE ==========
// 使用本地 CORS 代理 (先启动: node proxy.js)
const PROXY_BASE = `http://localhost:9999/v1`;
const DIRECT_BASE = 'https://apihub.agnes-ai.com/v1';
const API_BASE = DIRECT_BASE;
const API_HOST = 'http://127.0.0.1:18922';

let apiKey = '';
// Model config cache (loaded from backend)
window.modelConfig = {
  chat: { model: 'agnes-2.0-flash', temperature: 0.7, max_tokens: 4096 },
  image: { model: 'agnes-image-2.1-flash' },
  video: { model: 'agnes-video-v2.0' },
  agent: { model: 'agnes-2.0-flash', max_steps: 20, enable_thinking: false, reasoning_effort: 'high' }
};
window.apiBase = DIRECT_BASE;

let currentImageMode = 'text-to-image';
let currentVideoMode = 'text-to-video';
let imageGallery = JSON.parse(localStorage.getItem('agnes_image_gallery') || '[]');
let videoTasks = JSON.parse(localStorage.getItem('agnes_video_tasks') || '[]');
let pollingIntervals = {};
// Uploaded image cache: group -> [{name, dataUrl}]
let uploadedImages = {};

// ========== 视频时长自动计算 ==========
function updateVidParams(mode) {
  const prefix = mode === 't2v' ? '' : mode === 'i2v' ? 'vidI2v' : mode === 'multi' ? 'vidMulti' : 'vidKey';
  const dur = +(document.getElementById(prefix + 'Duration')?.value || 5);
  const sel = document.getElementById(prefix + 'Fps');
  if (!sel) return;
  const fps = +(sel.value || 24);
  
  // 动态过滤可用帧率
  const validFps = [24, 30, 60].filter(f => {
    let n = Math.max(1, Math.round((dur * f - 1) / 8));
    return n * 8 + 1 <= 441;
  });
  if (!validFps.includes(fps) && validFps.length > 0) sel.value = validFps[0];
  Array.from(sel.options).forEach(o => o.disabled = !validFps.includes(+o.value));
  
  const useFps = +(sel.value);
  let n = Math.max(1, Math.round((dur * useFps - 1) / 8));
  const frames = Math.min(441, n * 8 + 1);
  const show = document.getElementById(prefix + 'FramesShow');
  const hidden = document.getElementById(prefix + 'Frames');
  if (show) show.textContent = frames;
  if (hidden) hidden.value = frames;
  if (mode === 't2v') {
    const el = document.getElementById('vidDurationShow');
    if (el) el.textContent = '~' + (frames / useFps).toFixed(1) + 's';
  }
}

// Init calc on load


document.addEventListener('DOMContentLoaded', () => {
  initSplash();
  ['t2v','i2v','multi','key'].forEach(m => updateVidParams(m));
  // 恢复聊天记录显示
  if (chatMessages.length > 0) renderChatMessages();
  // 加载右边栏模型卡片
  loadChatModelCards();
});

// Init drag-and-drop on all upload zones
document.addEventListener('DOMContentLoaded', async () => {
 // 优先从后端读取 API Key（pywebview 每次新窗口会清空 localStorage）
 try {
  animateSplash(45, '连接后端服务…');
  await new Promise(r => setTimeout(r, 300));
  const resp = await fetch('http://127.0.0.1:18922/api/config/api-key');
  const data = await resp.json();
  animateSplash(65, '获取配置…');
  if (data.api_key) {
   apiKey = data.api_key;
   localStorage.setItem('agnes_api_key', apiKey);
  } else {
   apiKey = localStorage.getItem('agnes_api_key') || '';
  }
 } catch (e) {
  apiKey = localStorage.getItem('agnes_api_key') || '';
 }
 animateSplash(75, '配置就绪');
 const keyInput = document.getElementById('apiKeyInput');
 if (keyInput) keyInput.value = apiKey;
 document.querySelectorAll('.upload-zone').forEach(zone => {
 zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
 zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
 zone.addEventListener('drop', e => {
 e.preventDefault();
 zone.classList.remove('drag-over');
 const fileInput = zone.querySelector('input[type="file"]');
 const group = zone.id.replace('UploadZone', '');
 const dt = e.dataTransfer;
 if (dt && dt.files.length > 0) {
 if (fileInput.multiple) {
 const newFiles = Array.from(dt.files);
 // For multi-file, we replace the input's file list
 processUploadedFiles(newFiles, group, fileInput.multiple);
 } else {
 fileInput.files = dt.files;
 handleUploadFromDrop(fileInput, group);
 }
 }
 });
 });
 // 启动启动屏动画序列（启动屏由 startSplashSequence 自行管理隐藏）
 startSplashSequence();
 return;

 // 加载完成，隐藏启动屏（保留兜底逻辑，正常路径由上方 return 接管）
 animateSplash(100, '就绪 ✓');
 hideSplash(); // 标记就绪，等最短时间到后自动隐藏
});

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
}
function skipWelcome() {
 localStorage.setItem('aura_welcome_done', '1');
 document.getElementById('welcomeOverlay').classList.remove('show');
}

// Restore video task polling
videoTasks.forEach(task => {
 if (task.status === 'queued' || task.status === 'in_progress') {
 startPolling(task.id, task.mode);
 }
});

// ========== API KEY ==========
async function saveApiKey() {
 apiKey = document.getElementById('apiKeyInput').value.trim();
 localStorage.setItem('agnes_api_key', apiKey);
 try {
  await fetch('http://127.0.0.1:18922/api/config/api-key', {
   method: 'POST',
   headers: {'Content-Type': 'application/json'},
   body: JSON.stringify({api_key: apiKey})
  });
 } catch (e) {}
 showToast('API Key 已保存', 'success');
}

function getHeaders() {
 if (!apiKey) throw new Error('请先输入 API Key');
 return {
 'Authorization': 'Bearer ' + apiKey,
 'Content-Type': 'application/json'
 };
}

function getAuthHeaders() {
 if (!apiKey) throw new Error('请先输入 API Key');
 return { 'Authorization': 'Bearer ' + apiKey };
}

// ========== IMAGE UPLOAD / SOURCE TOGGLE ==========
function switchSource(group, mode) {
 const container = document.querySelector(`.source-input-group[data-group="${group}"]`);
 if (!container) return;
 container.querySelectorAll('.source-toggle-btn').forEach(b => {
 b.classList.toggle('active', b.dataset.src === mode);
 });
 container.querySelector('.source-url').style.display = mode === 'url' ? 'block' : 'none';
 container.querySelector('.source-upload').style.display = mode === 'upload' ? 'block' : 'none';
}

function isUploadMode(group) {
 const container = document.querySelector(`.source-input-group[data-group="${group}"]`);
 if (!container) return false;
 const activeBtn = container.querySelector('.source-toggle-btn.active');
 return activeBtn ? activeBtn.dataset.src === 'upload' : false;
}

function handleUpload(fileInput, group) {
 switchSource(group, "upload");
 processUploadedFiles(Array.from(fileInput.files), group, fileInput.multiple);
}

function handleUploadFromDrop(fileInput, group) {
 switchSource(group, "upload");
 processUploadedFiles(Array.from(fileInput.files), group, fileInput.multiple);
}

async function processUploadedFiles(files, group, isMulti) {
 if (!files || files.length === 0) return;
 uploadedImages[group] = uploadedImages[group] || [];

 if (!isMulti) {
  files = [files[0]];
 }

 const maxSize = 20 * 1024 * 1024;
 for (const file of files) {
  if (file.size > maxSize) {
   showToast(`${file.name} 超过 20MB 限制，已跳过`, 'error');
   continue;
  }
  showToast(`正在上传 ${file.name}...`, 'info');
  try {
   const fd = new FormData();
   fd.append('file', file);
   const resp = await fetch('http://127.0.0.1:18922/api/upload', {
    method: 'POST',
    body: fd,
   });
   const data = await resp.json();
   if (data.url) {
    uploadedImages[group].push({ name: file.name, url: data.url });
    showToast(`上传成功: ${file.name}`, 'success');
    // 自动将上传后的 CDN 链接填入关联的 URL 输入框（持久化，不怕刷新丢失）
    const urlInputMap = {
     'vidI2v': 'vidI2vUrl',
     'imgI2i': 'imgMultiUrls',
     'imgI2iMulti': 'imgMultiUrls'
    };
    const inputId = urlInputMap[group];
    if (inputId) {
     const inputEl = document.getElementById(inputId);
     if (inputEl) inputEl.value = data.url;
    }
   } else {
    showToast(`上传失败: ${data.error || '未知错误'}`, 'error');
   }
  } catch (e) {
   showToast(`上传异常: ${e.message}`, 'error');
  }
 }
 renderUploadPreviews(group);
}

function removeUploadedImage(group, index) {
 uploadedImages[group].splice(index, 1);
 renderUploadPreviews(group);
}

function renderUploadPreviews(group) {
 const previewsEl = document.getElementById(`${group}Previews`);
 const countEl = document.getElementById(`${group}Count`);
 const images = uploadedImages[group] || [];

 if (!previewsEl) return;

 if (images.length === 0) {
 previewsEl.innerHTML = '';
 previewsEl.classList.remove('has-files');
 if (countEl) countEl.classList.remove('visible');
 return;
 }

 previewsEl.classList.add('has-files');
 previewsEl.innerHTML = images.map((img, i) => `
 <div class="upload-preview-item">
 <img src="${img.url || img.dataUrl}" alt="${img.name}">
 <button class="upload-preview-remove" onclick="event.stopPropagation(); removeUploadedImage('${group}', ${i})">×</button>
 <div class="upload-preview-label">#${i + 1}</div>
 </div>
 `).join('');

 if (countEl) {
 countEl.textContent = `已选择 ${images.length} 张图片`;
 countEl.classList.add('visible');
 }
}

// Get image sources for API calls — returns array of URLs (either regular URLs or base64 data URLs)
function getImageSources(group, urlInputId) {
 if (isUploadMode(group)) {
 const images = uploadedImages[group] || [];
 if (images.length === 0) return [];
 return images.map(img => img.url || img.dataUrl);
 } else {
 const val = document.getElementById(urlInputId)?.value?.trim();
 return val ? [val] : [];
 }
}

// Get multi image sources from URL list or uploads
function getMultiImageSources(group, listId) {
 if (isUploadMode(group)) {
 const images = uploadedImages[group] || [];
 return images.map(img => img.url || img.dataUrl);
 } else {
 return getUrlList(listId);
 }
}

// ========== TABS ==========
function switchTab(name) {
 // 离开图像面板时重置I2I状态，防止面板污染
 if (name !== 'image' && currentImageMode === 'image-to-image') {
  setImageMode('text-to-image');
 }
 document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
 document.querySelector(`.tab[data-panel="${name}"]`).classList.add('active');
 
 // Panel切换动画：先锁定容器高度，再切面板
 const container = document.getElementById('panelContainer');
 const currentActive = document.querySelector('.panel.active');
 if (container && currentActive) {
  container.style.height = currentActive.offsetHeight + 'px';
 }
 
 setTimeout(() => {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(`panel-${name}`);
  panel.classList.add('active');
  if (container) {
   // 等渲染完成后获得新高度
   requestAnimationFrame(() => {
    container.style.height = panel.offsetHeight + 'px';
   });
  }
  if (name === 'tasks') renderTaskList();
 }, 60);
}

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
 // Load embedding config
 try {
  const embResp = await fetch(API_HOST + '/api/config/embedding');
  const emb = await embResp.json();
  const base = document.getElementById('setEmbedBase');
  if (base) base.value = emb.embedding_api_base || '';
  const key = document.getElementById('setEmbedKey');
  if (key) key.value = emb.embedding_api_key || '';
  const model = document.getElementById('setEmbedModel');
  if (model) model.value = emb.embedding_model || '';
  const dim = document.getElementById('setEmbedDim');
  if (dim) dim.value = emb.embedding_dimensions || 1024;
 } catch(e) { console.warn('[Embedding] load failed:', e); }
}
function hideSettings(event) {
 if (!event || event.target === document.getElementById('settingsOverlay')) {
  document.getElementById('settingsOverlay').classList.remove('show');
 }
}

// ===== 模型配置面板 =====
// 数据结构：每个类别 {default: "id", items: [{id,name,api_base,api_key,model}]}
// 全局 api_base 作为回退（每个 item 的 api_base/api_key 留空时用全局）
let _mcData = null; // 当前编辑中的模型配置

// 右边栏选中的聊天模型（model id，传给后端 Agent）
window.selectedChatModel = '';

// 从后端加载模型配置，渲染右边栏模型卡片
async function loadChatModelCards() {
 try {
  const resp = await fetch(API_HOST + '/api/config/models');
  const data = await resp.json();
  const chat = (data.models && data.models.chat) || {default:'', items:[]};
  const items = chat.items || [];
  const defaultId = chat.default || (items[0] && items[0].id) || '';
  const container = document.getElementById('chatModelCards');
  if (!container) return;
  if (!items.length) {
   container.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:8px;">未配置模型，请在「🤖 模型」中添加</div>';
   return;
  }
  container.innerHTML = items.map(it => {
   const isDefault = it.id === defaultId;
   const modelId = it.model || it.id;
   const name = it.name || it.id;
   return `<div class="model-card${isDefault?' active':''}" onclick="selectChatModel('${modelId}', this)">
    <div class="model-card-name">${escapeHtml(name)}</div>
    <div class="model-card-desc">${escapeHtml(modelId)}${it.api_base ? ' · 自定义接入' : ''}</div>
   </div>`;
  }).join('');
  // 默认选中默认模型
  const defItem = items.find(it => it.id === defaultId) || items[0];
  window.selectedChatModel = defItem ? (defItem.model || defItem.id) : '';
  const hidden = document.getElementById('chatModel');
  if (hidden) hidden.value = window.selectedChatModel;
 } catch(e) { console.warn('[ModelCards] load failed:', e); }
}

function selectChatModel(modelId, cardEl) {
 window.selectedChatModel = modelId;
 const hidden = document.getElementById('chatModel');
 if (hidden) hidden.value = modelId;
 document.querySelectorAll('#panel-text .model-card').forEach(m => m.classList.remove('active'));
 if (cardEl) cardEl.classList.add('active');
}

async function showModelConfig() {
 document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('show'));
 const overlay = document.getElementById('modelConfigOverlay');
 if (!overlay) return;
 try {
  const resp = await fetch(API_HOST + '/api/config/models');
  const data = await resp.json();
  _mcData = {
   api_base: data.api_base || 'https://apihub.agnes-ai.com/v1',
   models: data.models || {},
  };
  renderModelConfig();
 } catch(e) { console.warn('[ModelConfig] load failed:', e); }
 overlay.classList.add('show');
}

function hideModelConfig(event) {
 if (event && event.target !== document.getElementById('modelConfigOverlay')) return;
 const overlay = document.getElementById('modelConfigOverlay');
 if (overlay) overlay.classList.remove('show');
}

function renderModelConfig() {
 const body = document.getElementById('modelConfigBody');
 if (!body || !_mcData) return;
 const cats = [
  {key:'chat', label:'💬 文本模型', hint:'Agent 对话使用', defModel:'agnes-2.0-flash'},
  {key:'image', label:'🖼️ 图片模型', hint:'image_generate 工具使用', defModel:'agnes-image-2.1-flash'},
  {key:'video', label:'🎬 视频模型', hint:'video_create 工具使用', defModel:'agnes-video-v2.0'},
 ];
 let html = '';
 // 全局 API Base
 html += `<div class="settings-section">
   <div class="settings-section-title">🔗 全局 API 接入点（模型留空时回退到此）</div>
   <input id="mcApiBase" class="modal-input" placeholder="https://apihub.agnes-ai.com/v1" value="${escapeHtml(_mcData.api_base || '')}">
  </div><div class="settings-divider"></div>`;
 // 三个类别
 for (const c of cats) {
  const cat = _mcData.models[c.key] || {default:'', items:[]};
  if (!cat.items || !cat.items.length) {
   cat.items = [{id: c.defModel, name: c.defModel, api_base:'', api_key:'', model: c.defModel}];
   cat.default = c.defModel;
  }
  html += `<div class="settings-section">
    <div class="settings-section-title">${c.label} <span style="font-size:10px;color:var(--text-muted);font-weight:400;">${c.hint}</span></div>
    <div id="mcItems-${c.key}">${renderModelItems(c.key, cat)}</div>
    <button onclick="addModelItem('${c.key}','${c.defModel}')" style="margin-top:8px;padding:5px 12px;font-size:11px;border:1px dashed var(--accent-blue);border-radius:6px;background:transparent;color:var(--accent-blue);cursor:pointer;">＋ 添加模型</button>
   </div><div class="settings-divider"></div>`;
 }
 body.innerHTML = html;
}

function renderModelItems(catKey, cat) {
 const items = cat.items || [];
 const defaultId = cat.default || (items[0] && items[0].id) || '';
 return items.map((it, i) => {
  const isDefault = it.id === defaultId;
  return `<div style="border:1px solid var(--border);border-radius:8px;margin-bottom:8px;overflow:hidden;">
   <div style="display:flex;align-items:center;gap:6px;padding:8px 10px;background:var(--bg-surface);">
    <span onclick="toggleModelItemEdit(this, '${catKey}', ${i})" style="cursor:pointer;font-size:11px;flex:1;display:flex;align-items:center;gap:6px;">
      <span style="color:var(--text-muted);">▶</span>
      <strong style="color:var(--text-primary);">${escapeHtml(it.name || it.id)}</strong>
      ${isDefault ? '<span style="background:var(--accent-blue);color:#fff;padding:1px 6px;border-radius:3px;font-size:9px;">默认</span>' : ''}
      <span style="color:var(--text-muted);font-size:10px;">${escapeHtml(it.model || it.id)}</span>
    </span>
    ${isDefault ? '' : `<button onclick="setDefaultModel('${catKey}', ${i})" style="font-size:10px;padding:2px 8px;border:1px solid var(--accent-blue);border-radius:4px;background:transparent;color:var(--accent-blue);cursor:pointer;">默认</button>`}
    <button onclick="removeModelItem('${catKey}', ${i})" style="font-size:11px;padding:2px 6px;border:none;border-radius:4px;background:transparent;color:var(--accent-red);cursor:pointer;">✕</button>
   </div>
   <div class="model-item-edit" style="display:none;padding:10px;border-top:1px solid var(--border);gap:8px;display:none;flex-direction:column;">
    <div><div class="label" style="font-size:10px;">显示名称</div><input class="modal-input mc-field" data-cat="${catKey}" data-idx="${i}" data-field="name" value="${escapeHtml(it.name || '')}" placeholder="如 DeepSeek V3"></div>
    <div><div class="label" style="font-size:10px;">模型 ID（API 调用用）</div><input class="modal-input mc-field" data-cat="${catKey}" data-idx="${i}" data-field="model" value="${escapeHtml(it.model || '')}" placeholder="deepseek-chat"></div>
    <div><div class="label" style="font-size:10px;">API 接入点（留空用全局）</div><input class="modal-input mc-field" data-cat="${catKey}" data-idx="${i}" data-field="api_base" value="${escapeHtml(it.api_base || '')}" placeholder="https://api.deepseek.com/v1"></div>
    <div><div class="label" style="font-size:10px;">API Key（留空用全局）</div><input class="modal-input mc-field" type="password" data-cat="${catKey}" data-idx="${i}" data-field="api_key" value="${escapeHtml(it.api_key || '')}" placeholder="sk-..."></div>
   </div>
  </div>`;
 }).join('');
}

function toggleModelItemEdit(headerEl, catKey, idx) {
 const wrap = headerEl.closest('div[style*="border:1px solid"]');
 const edit = wrap.querySelector('.model-item-edit');
 if (edit) {
  // 先保存当前编辑值到 _mcData
  collectModelFields();
  edit.style.display = edit.style.display === 'none' ? 'flex' : 'none';
  const arrow = headerEl.querySelector('span:first-child');
  if (arrow) arrow.textContent = edit.style.display === 'none' ? '▶' : '▼';
 }
}

function collectModelFields() {
 // 把所有 input.mc-field 的值收集回 _mcData
 document.querySelectorAll('.mc-field').forEach(inp => {
  const cat = inp.dataset.cat, idx = parseInt(inp.dataset.idx), field = inp.dataset.field;
  if (_mcData.models[cat] && _mcData.models[cat].items[idx]) {
   _mcData.models[cat].items[idx][field] = inp.value;
   // name 改了同步 id（id 用 name 或 model）
   if (field === 'name' && inp.value) {
    _mcData.models[cat].items[idx].id = inp.value;
   } else if (field === 'model' && inp.value && !_mcData.models[cat].items[idx].name) {
    _mcData.models[cat].items[idx].id = inp.value;
   }
  }
 });
}

function addModelItem(catKey, defModel) {
 collectModelFields();
 if (!_mcData.models[catKey]) _mcData.models[catKey] = {default:'', items:[]};
 const newId = 'model_' + Date.now();
 _mcData.models[catKey].items.push({id:newId, name:'', api_base:'', api_key:'', model:''});
 renderModelConfig();
 // 自动展开新加的项
 setTimeout(() => {
  const wrap = document.querySelector(`#mcItems-${catKey} > div:last-child .model-item-edit`);
  if (wrap) wrap.style.display = 'flex';
 }, 50);
}

function removeModelItem(catKey, idx) {
 collectModelFields();
 if (!_mcData.models[catKey]) return;
 const items = _mcData.models[catKey].items;
 if (items.length <= 1) { showToast('至少保留一个模型', 'error'); return; }
 const removed = items[idx];
 items.splice(idx, 1);
 if (_mcData.models[catKey].default === removed.id) {
  _mcData.models[catKey].default = items[0].id;
 }
 renderModelConfig();
}

function setDefaultModel(catKey, idx) {
 collectModelFields();
 if (!_mcData.models[catKey]) return;
 _mcData.models[catKey].default = _mcData.models[catKey].items[idx].id;
 renderModelConfig();
}

async function saveModelConfig() {
 collectModelFields();
 // 同步全局 api_base
 const apiBaseInput = document.getElementById('mcApiBase');
 if (apiBaseInput) _mcData.api_base = apiBaseInput.value.trim();
 var msg = document.getElementById('modelConfigMsg');
 msg.textContent = '保存中…';
 msg.style.color = 'var(--text-muted)';
 try {
  const resp = await fetch(API_HOST + '/api/config/models', {
   method: 'POST',
   headers: {'Content-Type': 'application/json'},
   body: JSON.stringify({api_base: _mcData.api_base, models: _mcData.models}),
  });
  const result = await resp.json();
  if (result.ok) {
   msg.textContent = '✅ 模型配置已保存';
   msg.style.color = 'var(--accent-green)';
   window.modelConfig = result.models || _mcData.models;
   window.apiBase = _mcData.api_base;
   showToast('模型配置已保存', 'success');
   loadChatModelCards(); // 刷新右边栏模型卡片
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
 // Save embedding config
 try {
  var embData = {
   embedding_model: document.getElementById('setEmbedModel')?.value?.trim() || '',
   embedding_api_key: document.getElementById('setEmbedKey')?.value?.trim() || '',
   embedding_api_base: document.getElementById('setEmbedBase')?.value?.trim() || '',
   embedding_dimensions: parseInt(document.getElementById('setEmbedDim')?.value) || 1024,
  };
  if (embData.embedding_api_base && embData.embedding_api_key) {
   await fetch(API_HOST + '/api/config/embedding', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(embData)
   });
  }
 } catch(e) { console.warn('Embedding save failed:', e); }
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

// ========== SPLASH SCREEN ==========
const SPLASH_TAGLINES = [
 'AI 多模态创作工作台',
 '文本 · 图像 · 视频 · 无限画布',
 '以创想为引擎，让 AI 为你而生',
 'AURA — 你的 AI 创作伙伴'
];
let splashTaglineTimer = null;
let splashHideReady = false;
let splashHideTimer = null;
let splashTypewriterDone = false; // 打字机第一轮完成标记

function animateSplash(progress, status) {
 const bar = document.getElementById('splashBar');
 const el = document.getElementById('splashStatus');
 if (bar) bar.style.width = progress + '%';
 if (el && status) el.textContent = status;
}
function hideSplash() {
 splashHideReady = true;
}
function tryHideSplash() {
 if (splashHideReady && splashTypewriterDone && splashHideTimer) {
  animateSplash(100, '就绪 ✓');
  setTimeout(function() {
   var el = document.getElementById('appLoading');
   if (el) { el.classList.add('hide'); setTimeout(function() {
    if (el.parentNode) el.parentNode.removeChild(el);
    // 启动屏消失后检查是否需要显示欢迎引导
    var saved = localStorage.getItem('aura_welcome_done');
    if (!apiKey && !saved) {
     var wo = document.getElementById('welcomeOverlay');
     if (wo) wo.classList.add('show');
    }
   }, 800); }
  }, 400);
 }
}
function initSplash() {
 // 先生成粒子背景，不启动打字机和进度条
 const container = document.getElementById('splashParticles');
 if (container) {
  for (let i = 0; i < 24; i++) {
   const dot = document.createElement('div');
   const size = 1.5 + Math.random() * 3;
   const x = Math.random() * 100;
   const y = Math.random() * 100;
   const dur = 3 + Math.random() * 5;
   const delay = Math.random() * 4;
   const colors = ['#4d8cfc', '#a277ff', '#44eebb', '#ff6b9d', '#ff9e64'];
   const color = colors[Math.floor(Math.random() * colors.length)];
   dot.style.cssText = `position:absolute;left:${x}%;top:${y}%;width:${size}px;height:${size}px;border-radius:50%;background:${color};opacity:${0.15 + Math.random() * 0.35};animation:splash-float ${dur}s ease-in-out ${delay}s infinite;`;
   container.appendChild(dot);
  }
 }
}

// 启动屏动画序列（打字机 + 进度条 + 自动隐藏）
function startSplashSequence() {
 // 标记加载就绪，打字机完成后自动触发 tryHideSplash()
 splashHideReady = true;
 // 设置隐藏条件：splashHideTimer 在 4.5 秒后自动满足
 if (!splashHideTimer) splashHideTimer = setTimeout(() => {}, 4500);

 // 计算打字机总进度基数（所有字符+行间停顿）
 var totalChars = SPLASH_TAGLINES.reduce(function(s, l) { return s + l.length; }, 0);
 var totalPauses = (SPLASH_TAGLINES.length - 1) * 1500; // 行间停顿总时间
 var charsTyped = 0;

 // Typewriter effect — 进度条与打字同步
 var taglineIdx = 0;
 var charIdx = 0;
 var taglineEl = document.getElementById('splashTagline');
 if (taglineEl) {
  function typeNext() {
   var line = SPLASH_TAGLINES[taglineIdx];
   if (charIdx <= line.length) {
    taglineEl.textContent = line.slice(0, charIdx);
    charIdx++;
    charsTyped++;
    // 动态更新进度条：基于已打字数占总进度的比例
    var progress = Math.min(85, Math.round((charsTyped / totalChars) * 85) + 5);
    animateSplash(progress, '');
    splashTaglineTimer = setTimeout(typeNext, 25 + Math.random() * 30);
   } else {
    if (taglineIdx === SPLASH_TAGLINES.length - 1) {
     animateSplash(100, '就绪 ✓');
     splashTypewriterDone = true;
     tryHideSplash();
    }
    splashTaglineTimer = setTimeout(function() {
     taglineEl.textContent = '';
     taglineIdx = (taglineIdx + 1) % SPLASH_TAGLINES.length;
     charIdx = 0;
     setTimeout(typeNext, 600);
    }, 1500);
   }
  }
  typeNext();
 } else {
  // 无打字机时用简单渐近进度
  animateSplash(10, '准备就绪…');
  setTimeout(function() { animateSplash(40, '加载界面…'); }, 600);
  setTimeout(function() { animateSplash(70, '配置就绪'); }, 1500);
  setTimeout(function() { animateSplash(100, '就绪 ✓'); hideSplash(); }, 2500);
 }
}
// Add particle float animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `@keyframes splash-float {
 0%, 100% { transform: translateY(0) translateX(0); opacity: 0.3; }
 25% { transform: translateY(-20px) translateX(10px); opacity: 0.6; }
 50% { transform: translateY(-10px) translateX(-10px); opacity: 0.4; }
 75% { transform: translateY(-30px) translateX(5px); opacity: 0.5; }
}`;
document.head.appendChild(styleSheet);

// ========== CHAT / SESSION ==========
let sessions = [];
let currentSessionId = null;
let chatMessages = []; // 当前会话的消息别名
let chatAbortController = null;
let chatImageDataUrl = null;

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

// 加载会话
loadSessions();

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

function formatMessageContent(text) {
 if (!text) return '';
 // Handle multimodal array content (text + image_url)
 if (Array.isArray(text)) {
  let result = '';
  for (const part of text) {
   if (part.type === 'text' && part.text) {
    result += formatMessageContentString(part.text);
   } else if (part.type === 'image_url' && part.image_url?.url) {
    const src = part.image_url.url;
    const safeSrc = src.replace(/'/g, "\\'");
    result += '<div style="margin:8px 0;"><img src="' + src + '" onclick="openImagePreview(\'' + safeSrc + '\')" style="max-width:100%;max-height:300px;border-radius:8px;border:1px solid var(--border);cursor:zoom-in;" alt="chat image"></div>';
   }
  }
  return result;
 }
 // 字符串内容：含 --- 分隔线则用混合渲染（思考+正文），否则普通 Markdown
 if (typeof text === 'string' && text.indexOf('\n\n---\n\n') !== -1) {
  return formatMixedContent(text);
 }
 return formatMessageContentString(text);
}

// 渲染含思考过程的混合内容（思考部分灰色斜体 + 分隔线 + 正文）
// 与 chat_stream.js 的 renderMixedContent 保持一致
function formatMixedContent(text) {
 if (!text) return '';
 const sep = '\n\n---\n\n';
 const idx = text.indexOf(sep);
 if (idx === -1) {
  return formatMessageContentString(text);
 }
 const reasoningPart = text.substring(0, idx);
 const contentPart = text.substring(idx + sep.length);
 let html = '<em style="color:var(--text-muted);font-style:italic;white-space:pre-wrap;">' + escapeHtml(reasoningPart) + '</em>';
 html += '<hr style="border:none;border-top:1px dashed var(--border);margin:8px 0;">';
 html += formatMessageContentString(contentPart);
 return html;
}

function formatMessageContentString(text) {
 if (!text) return '';
 // Escape HTML
 let html = text
 .replace(/&/g, '&amp;')
 .replace(/</g, '&lt;')
 .replace(/>/g, '&gt;');
 // Code blocks: ```...```
 html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
 return `<pre><code class="language-${lang}">${code}</code></pre>`;
 });
 // Inline code: `...`
 html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
 // Bold: **...**
 html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
 // Italic: *...*
 html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
 // Markdown images: ![desc](url) — 可点击放大
 html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, desc, url) => {
  const safeUrl = url.replace(/'/g, "\\'");
  return '<div style="margin:8px 0;"><img src="' + url + '" onclick="openImagePreview(\'' + safeUrl + '\')" style="max-width:100%;max-height:400px;border-radius:8px;border:1px solid var(--border);cursor:zoom-in;" alt="' + desc + '"></div>';
 });
 // Line breaks
 html = html.replace(/\n/g, '<br>');
 return html;
}

function escapeHtml(text) {
 if (!text) return '';
 return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

function handleChatKey(event) {
 if (event.key === 'Enter' && !event.shiftKey) {
 event.preventDefault();
 sendChatMessage();
 }
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
 btnSend.disabled = true;
 btnText.style.display = 'none';
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

 const model = document.getElementById('chatModel').value;
 const streaming = document.getElementById('chatStreaming').checked;
 const deepThink = document.getElementById('chatDeepThink').checked;
 let systemPrompt = document.getElementById('chatSystemPrompt').value.trim();

 // 深度思考：在系统提示词前追加推理指令
 if (deepThink) {
  const thinkInstruction = '请先进行深度推理思考，分析问题的多个维度，给出清晰的推理过程和结论。';
  systemPrompt = systemPrompt ? thinkInstruction + '\n' + systemPrompt : thinkInstruction;
 }

 // Build messages array for API
 const messages = [];
 if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
 chatMessages.forEach(m => messages.push({ role: m.role, content: m.content }));

const body = {
	 model: model,
	 messages: messages,
	 temperature: parseFloat(document.getElementById('chatTemperature').value) || 0.7,
	 max_tokens: parseInt(document.getElementById('chatMaxTokens').value) || 2048,
	 top_p: parseFloat(document.getElementById('chatTopP').value) || 0.9,
	 stream: streaming,
	 enabled_skills: typeof getEnabledSkillsList === 'function' ? getEnabledSkillsList() : undefined,
	 };

 // Add assistant placeholder
 chatMessages.push({ role: 'assistant', content: '' });
 const assistantIdx = chatMessages.length - 1;
 renderChatMessages();
 // 显示"正在思考…"动画
 var thinkBubble = document.querySelector('.chat-msg.assistant:last-child .chat-bubble');
 if (thinkBubble) { thinkBubble.innerHTML = '<span class="chat-thinking"><span>正</span><span>在</span><span>思</span><span>考</span><span class="chat-thinking-dot">.</span><span class="chat-thinking-dot">.</span><span class="chat-thinking-dot">.</span></span>'; }

 try {
  chatAbortController = new AbortController();
  const resp = await fetch(API_HOST + '/api/chat/completions', {
   method: 'POST',
   headers: {'Content-Type': 'application/json'},
   body: JSON.stringify({...body, _api_key: apiKey}),
   signal: chatAbortController.signal
  });

 if (!resp.ok) {
 const err = await resp.json().catch(() => ({}));
 throw new Error(err.error?.message || `HTTP ${resp.status}`);
 }

 if (streaming) {
 // SSE streaming — 直接更新最后一条气泡，不重新渲染全部消息
 const reader = resp.body.getReader();
 const decoder = new TextDecoder();
 let buffer = '';
 let lastRender = 0;

 while (true) {
 const { done, value } = await reader.read();
 if (done) break;
 buffer += decoder.decode(value, { stream: true });

 // Parse SSE lines: data: {"choices":[{"delta":{"content":"..."}}]}
 // 用 lines.pop() 保留最后一个可能未完成的行，下个 chunk 拼接。
 // 不能用 buffer='' 再靠 else 恢复 —— 当 chunk 边界切在 data: JSON 中间时，
 // 不完整的 data 行会进 if 分支解析失败被吞、不进 else，导致整条 SSE 事件丢失（回复截断）。
 const lines = buffer.split('\n');
 buffer = lines.pop();
 for (const line of lines) {
 if (line.startsWith('data: ')) {
 const jsonStr = line.slice(6).trim();
 if (jsonStr === '[DONE]') continue;
 try {
 const chunk = JSON.parse(jsonStr);
 const delta = chunk.choices?.[0]?.delta?.content;
 if (delta) {
 chatMessages[assistantIdx].content += delta;
 if (chatMessages[assistantIdx].content.length % 500 < 10) saveChatHistory();
 }
 const reasoningDelta = chunk.choices?.[0]?.delta?.reasoning_content;
 if (reasoningDelta) {
  if (!window._reasoningBuffer) window._reasoningBuffer = '';
  window._reasoningBuffer += reasoningDelta;
 }
 } catch(e) {}
 }
 }
 // 直接更新 DOM 避免全量重绘
 const now = Date.now();
 if (now - lastRender > 50) {
 const bubble = document.querySelector('.chat-msg.assistant:last-child .chat-bubble');
 if (bubble) {
  const plain = chatMessages[assistantIdx].content;
  bubble.innerHTML = escapeHtml(plain);
  bubble.classList.add('chat-streaming');
 }
 // 滚动到底部
 var el = document.querySelector('.chat-msg:last-child');
 if (el) el.scrollIntoView({ block: 'end' });
 lastRender = now;
 }
 }
 // Final render: 去掉流式光标 + 完整渲染确保格式正确
 chatMessages[assistantIdx].content = chatMessages[assistantIdx].content || '';
 renderChatMessages();
 saveChatHistory();
 trimChatHistory(); // 安全时机：流式完成后截断
 } else {
 // Non-streaming
 const data = await resp.json();
 chatMessages[assistantIdx].content = data.choices?.[0]?.message?.content || '';
 renderChatMessages();
 saveChatHistory();
 trimChatHistory(); // 安全时机：流式完成后截断
 }
 } catch (e) {
 if (e.name === 'AbortError') {
 chatMessages[assistantIdx].content += '\n\n*[生成已停止]*';
 } else {
 chatMessages[assistantIdx].content = `❌ 错误: ${e.message}`;
 }
 renderChatMessages();
 saveChatHistory();
 trimChatHistory(); // 安全时机：出错后截断
 } finally {
 chatAbortController = null;
 btnSend.disabled = false;
 btnText.style.display = '';
 btnSpinner.style.display = 'none';
 inputEl.focus();
 }
}

function stopGeneration() {
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

// Auto-resize chat textarea
document.getElementById('chatInput').addEventListener('input', function() {
 this.style.height = 'auto';
 this.style.height = Math.min(this.scrollHeight, 150) + 'px';
});

// ========== IMAGE MODE ==========
function setImageMode(mode) {
 currentImageMode = mode;
 document.querySelectorAll('#panel-image .mode-btn').forEach(b => b.classList.remove('active'));
 document.querySelector(`#panel-image .mode-btn[data-mode="${mode}"]`).classList.add('active');
 document.getElementById('imageFormT2I').style.display = mode === 'text-to-image' ? '' : 'none';
 document.getElementById('imageFormI2I').style.display = mode === 'image-to-image' ? '' : 'none';
 // 隐藏T2I卡片闭合后泄漏的元素（form-row/按钮/error-msg）
 var t2iCard = document.getElementById('imageFormT2I');
 var i2iCard = document.getElementById('imageFormI2I');
 var el = t2iCard.nextElementSibling;
 while (el && el !== i2iCard) {
  el.style.display = mode === 'text-to-image' ? '' : 'none';
  el = el.nextElementSibling;
 }
}

// ========== VIDEO MODE ==========
function setVideoMode(mode) {
 currentVideoMode = mode;
 document.querySelectorAll('#panel-video .mode-btn').forEach(b => b.classList.remove('active'));
 document.querySelector(`#panel-video .mode-btn[data-vmode="${mode}"]`).classList.add('active');
 ['videoFormT2V', 'videoFormI2V', 'videoFormMulti', 'videoFormKeyframes'].forEach(id => {
 document.getElementById(id).style.display = 'none';
 });
 const map = {
 'text-to-video': 'videoFormT2V',
 'image-to-video': 'videoFormI2V',
 'multi-image': 'videoFormMulti',
 'keyframes': 'videoFormKeyframes'
 };
 document.getElementById(map[mode]).style.display = '';
}

function updateDuration() {
 const frames = parseInt(document.getElementById('vidFrames').value) || 121;
 const fps = parseFloat(document.getElementById('vidFps').value) || 24;
 const valid = frames <= 441 && (frames - 1) % 8 === 0;
 const dur = (frames / fps).toFixed(1);
 const el = document.getElementById('vidDuration');
 el.textContent = valid ? `~${dur}s` : `~${dur}s (帧数需满足 8n+1)`;
 if (!valid) el.style.color = 'var(--accent-orange)';
 else el.style.color = '';
}

function toggleAdvanced(id) {
 const toggle = document.getElementById(id).previousElementSibling;
 const panel = document.getElementById(id);
 toggle.classList.toggle('open');
 panel.classList.toggle('open');
}

// ========== URL LIST HELPERS ==========
function addUrl(listId) {
 const list = document.getElementById(listId);
 const row = document.createElement('div');
 row.className = 'url-row';
 row.innerHTML = `<input type="text" placeholder="https://example.com/image.png"><button class="btn-remove-url" onclick="removeUrl(this)" title="移除">×</button>`;
 list.appendChild(row);
}

function removeUrl(btn) {
 const list = btn.closest('.url-list');
 if (list.children.length > 1) {
 btn.closest('.url-row').remove();
 }
}

function getUrlList(listId) {
 return Array.from(document.getElementById(listId).querySelectorAll('input'))
 .map(i => i.value.trim())
 .filter(u => u);
}

// ========== IMAGE GENERATION ==========
async function generateTextToImage() {
 const btn = document.getElementById('btnT2iGenerate');
 const errorEl = document.getElementById('imgError');
 if (!btn) { console.warn('[T2I] btnT2iGenerate 不存在'); return; }
 if (!errorEl) { console.warn('[T2I] imgError 不存在'); return; }
 btn.classList.add('loading');
 errorEl.style.display = 'none';
 showToast('⏳ 正在生成图像…', 'info');

 try {
 const prompt = document.getElementById('imgPrompt').value.trim();
 if (!prompt) throw new Error('请输入 Prompt 提示词');
 const autoTL = document.getElementById('chkAutoTranslate');
 const finalPrompt = (autoTL && autoTL.checked) ? await autoTranslatePrompt(prompt) : prompt;
 if (finalPrompt !== prompt) {
  showToast('📝 Prompt 已翻译为英文', 'info');
  document.getElementById('imgPrompt').value = finalPrompt;
 }

 const size = document.getElementById('imgSize').value;
 const responseFormat = document.getElementById('imgResponseFormat').value;

 const body = {
 model: document.getElementById('imgT2iModel').value,
 prompt: finalPrompt,
 size: size
 };
 if (responseFormat === 'url') {
 body.extra_body = { response_format: 'url' };
 }

 const resp = await fetch(API_HOST + '/api/image/generate', {
 method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...body, _api_key: apiKey})
 });
 if (!resp.ok) {
 const err = await resp.json().catch(() => ({}));
 throw new Error(err.error?.message || `HTTP ${resp.status}: ${resp.statusText}`);
 }

 const data = await resp.json();
 console.log('[T2I] API响应完整:', JSON.stringify(data));
 displayImageResult(data);
 saveToGallery(data, finalPrompt, 't2i');
 } catch (e) {
 errorEl.textContent = '❌ ' + e.message;
 console.error('[I2I]', e);
 errorEl.style.display = 'block';
 } finally {
 btn.classList.remove('loading');
 }
}

async function generateImageToImage() {
 console.log('[I2I] generateImageToImage called');
 const btn = document.getElementById('btnI2iGenerate');
 const errorEl = document.getElementById('imgI2iError');
 if (!btn) { console.warn('[I2I] btnI2iGenerate 不存在'); return; }
 if (!errorEl) { console.warn('[I2I] imgI2iError 不存在'); return; }
 btn.classList.add('loading');
 errorEl.style.display = 'none';
 showToast('⏳ 正在生成图像…', 'info');

 try {
 let prompt = document.getElementById('imgI2iPrompt').value.trim();
 if (!prompt) throw new Error('请输入 Prompt 提示词');
 prompt = await autoTranslatePrompt(prompt);

 // Get image sources from either URL input or upload
 let imageUrls = [];
 if (isUploadMode('imgI2iMulti')) {
 imageUrls = (uploadedImages['imgI2iMulti'] || []).map(img => img.url || img.dataUrl);
 } else if (isUploadMode('imgI2i')) {
 imageUrls = (uploadedImages['imgI2i'] || []).map(img => img.url || img.dataUrl);
 } else {
 const urlVal = document.getElementById('imgMultiUrls').value.trim();
 if (urlVal) imageUrls = urlVal.split(',').map(u => u.trim()).filter(Boolean);
 }
 if (imageUrls.length === 0) throw new Error('请提供至少1张参考图像');

 // 收集注释，合成进 prompt
 const annotations = [];
 const annContainer = document.getElementById('imgI2iAnnotations');
 if (annContainer) {
 const inputs = annContainer.querySelectorAll('input');
 inputs.forEach((inp, idx) => {
 if (inp.value.trim() && idx < imageUrls.length) {
 annotations.push(inp.value.trim());
 }
 });
 }
 if (annotations.length > 0) {
 const annStr = annotations.map((a, i) => '图' + (i+1) + ': ' + a).join('; ');
 prompt = prompt + '\n\n参考图说明: ' + annStr;
 }



 const selectedModel = document.getElementById('imgModel').value;
 const body = {
 model: document.getElementById('imgModel').value,
 prompt: prompt,
 size: document.getElementById('imgI2iSize').value,
 extra_body: {
 image: imageUrls,
 response_format: 'url'
 }
 };

 if (selectedModel === 'agnes-image-2.0-flash') {
 body.tags = ['img2img'];
 }

 console.log('[I2I] request body:', JSON.stringify(body));
 const resp = await fetch(API_HOST + '/api/image/generate', {
 method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...body, _api_key: apiKey})
 });
 if (!resp.ok) {
 const err = await resp.json().catch(() => ({}));
 throw new Error(err.error?.message || `HTTP ${resp.status}`);
 }

 const data = await resp.json();
 console.log('[I2I] response status:', resp.status, 'data:', JSON.stringify(data).substring(0, 200));
 displayImageResult(data);
 console.log('[I2I] displayImageResult called');
 saveToGallery(data, prompt, 'i2i');
 } catch (e) {
 errorEl.textContent = '❌ ' + e.message;
 errorEl.style.display = 'block';
 } finally {
 btn.classList.remove('loading');
 console.log('[I2I] done');
 }
}

function displayImageResult(data) {
 let imageUrl = null;
 if (data.data && data.data[0]) {
 if (data.data[0].url) imageUrl = data.data[0].url;
 else if (data.data[0].b64_json) imageUrl = 'data:image/png;base64,' + data.data[0].b64_json;
 else if (typeof data.data[0] === 'string') imageUrl = data.data[0];
 }
 if (!imageUrl && data.url) imageUrl = data.url;
 if (!imageUrl && data.image_url) imageUrl = data.image_url;

 if (imageUrl) {
 addThumbToGrid('imageThumbGrid', imageUrl, '', currentImageMode);
 showToast('✅ 图像生成成功！', 'success');
 } else {
 throw new Error('未收到图像 URL，响应: ' + JSON.stringify(data).slice(0, 200));
 }
}

function addThumbToGrid(gridId, url, label, sourceType) {
 var grid = document.getElementById(gridId);
 if (!grid) return;
 var empty = grid.querySelector('.thumb-empty');
 if (empty) grid.innerHTML = '';
 var div = document.createElement('div');
 div.className = 'thumb-item';
 div.onclick = function() { openImagePreview(url); };
 var tag = sourceType === 'i2i' ? 'I2I' : 'T2I';
 div.innerHTML = '<span class="thumb-tag ' + (sourceType||'t2i') + '">' + tag + '</span><img src="' + url + '" loading="lazy" alt="">' + (label ? '<div class="thumb-label">' + label + '</div>' : '');
 grid.insertBefore(div, grid.firstChild);
 while (grid.children.length > 5) grid.removeChild(grid.lastChild);
}

function saveToGallery(data, prompt, sourceType) {
 sourceType = sourceType || 't2i';
 let imageUrl = null;
 if (data.data && data.data[0]) {
 imageUrl = data.data[0].url || data.data[0].b64_json || data.data[0];
 }
 if (!imageUrl) imageUrl = data.url || data.image_url;
 if (!imageUrl) return;

 if (typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) {
 imageUrl = 'data:image/png;base64,' + imageUrl;
 }

 imageGallery.unshift({
 url: imageUrl,
 prompt: prompt.slice(0, 100),
 time: new Date().toISOString(),
 type: sourceType
 });
 if (imageGallery.length > 20) imageGallery = imageGallery.slice(0, 20);
 localStorage.setItem('agnes_image_gallery', JSON.stringify(imageGallery));
 renderImageGallery();
}

function renderImageGallery() {
 var grid = document.getElementById('imageGalleryThumbs');
 if (!grid) return;
 if (imageGallery.length === 0) {
 grid.innerHTML = '<div class="thumb-empty">暂无记录</div>';
 return;
 }
 grid.innerHTML = imageGallery.map(function(item) {
 var tag = item.type === 'i2i' ? 'I2I' : 'T2I';
 var url = item.url.replace(/'/g, "\\'");
 return '<div class="thumb-item" onclick="openImagePreview(\'' + url + '\')"><span class="thumb-tag ' + (item.type||'t2i') + '">' + tag + '</span><img src="' + item.url + '" loading="lazy" alt=""><div class="thumb-label">' + item.prompt + '</div></div>';
 }).join('');
}

function openImagePreview(url) {
 var m = document.getElementById('imagePreviewModal');
 var i = document.getElementById('imagePreviewImg');
 var u = document.getElementById('imagePreviewUrl');
 if (i) i.src = url;
 if (u) u.value = url;
 if (m) m.classList.add('show');
}

function previewGalleryImage(index) {
 var item = imageGallery[index];
 if (item) openImagePreview(item.url);
}

// ========== VIDEO GENERATION ==========
async function createVideoTask(mode) {
 const modeMap = {
 'text-to-video': {
 form: 'videoFormT2V', error: 'vidError',
 getBody: () => ({
 model: 'agnes-video-v2.0',
 mode: 'ti2vid',
 prompt: document.getElementById('vidPrompt').value.trim(),
 height: parseInt(document.getElementById('vidHeight').value) || 768,
 width: parseInt(document.getElementById('vidWidth').value) || 1152,
 num_frames: parseInt(document.getElementById('vidFrames').value) || 121,
 frame_rate: parseFloat(document.getElementById('vidFps').value) || 24
 }),
 getAdvanced: () => {
 const body = {};
 if (document.getElementById('vidAdvancedT2V').classList.contains('open')) {
 const steps = parseInt(document.getElementById('vidSteps').value);
 const seed = document.getElementById('vidSeed').value;
 const neg = document.getElementById('vidNegativePrompt').value.trim();
 if (steps) body.num_inference_steps = steps;
 if (seed) body.seed = parseInt(seed);
 if (neg) body.negative_prompt = neg;
 }
 return body;
 }
 },
 'image-to-video': {
 form: 'videoFormI2V', error: 'vidI2vError',
 getBody: () => {
 let imageUrl = '';
 // 不限模式，同时检查两种来源：上传图片优先，URL输入兜底
 const imgs = uploadedImages['vidI2v'] || [];
 if (imgs.length > 0 && (imgs[0].url || imgs[0].dataUrl)) {
 imageUrl = imgs[0].url || imgs[0].dataUrl;
 } else {
 imageUrl = document.getElementById('vidI2vUrl').value.trim();
 }
      return {
        model: 'agnes-video-v2.0',
        prompt: document.getElementById('vidI2vPrompt').value.trim(),
        image: imageUrl,
 height: parseInt(document.getElementById('vidI2vHeight').value) || 768,
 width: parseInt(document.getElementById('vidI2vWidth').value) || 1152,
 num_frames: parseInt(document.getElementById('vidI2vFrames').value) || 121,
 frame_rate: parseFloat(document.getElementById('vidI2vFps').value) || 24
 };
 },
 getAdvanced: () => {
 const body = {};
 if (document.getElementById('vidAdvancedI2V').classList.contains('open')) {
 const steps = parseInt(document.getElementById('vidI2vSteps').value);
 const seed = document.getElementById('vidI2vSeed').value;
 const neg = document.getElementById('vidI2vNegativePrompt').value.trim();
 if (steps) body.num_inference_steps = steps;
 if (seed) body.seed = parseInt(seed);
 if (neg) body.negative_prompt = neg;
 }
 return body;
 }
 },
 'multi-image': {
 form: 'videoFormMulti', error: 'vidMultiError',
 getBody: () => {
 const imageUrls = getMultiImageSources('vidMulti', 'vidMultiUrls');
 return {
 model: 'agnes-video-v2.0',
 prompt: document.getElementById('vidMultiPrompt').value.trim(),
 extra_body: { image: imageUrls },
 height: parseInt(document.getElementById('vidMultiHeight').value) || 768,
 width: parseInt(document.getElementById('vidMultiWidth').value) || 1152,
 num_frames: parseInt(document.getElementById('vidMultiFrames').value) || 121,
 frame_rate: parseFloat(document.getElementById('vidMultiFps').value) || 24
 };
 },
 getAdvanced: () => {
 const body = {};
 if (document.getElementById('vidAdvancedMulti').classList.contains('open')) {
 const steps = parseInt(document.getElementById('vidMultiSteps').value);
 const seed = document.getElementById('vidMultiSeed').value;
 const neg = document.getElementById('vidMultiNegativePrompt').value.trim();
 if (steps) body.num_inference_steps = steps;
 if (seed) body.seed = parseInt(seed);
 if (neg) body.negative_prompt = neg;
 }
 return body;
 }
 },
 'keyframes': {
 form: 'videoFormKeyframes', error: 'vidKeyError',
 getBody: () => {
 const imageUrls = getMultiImageSources('vidKey', 'vidKeyUrls');
 return {
 model: 'agnes-video-v2.0',
 prompt: document.getElementById('vidKeyPrompt').value.trim(),
 extra_body: {
 image: imageUrls,
 mode: 'keyframes'
 },
 height: parseInt(document.getElementById('vidKeyHeight').value) || 768,
 width: parseInt(document.getElementById('vidKeyWidth').value) || 1152,
 num_frames: parseInt(document.getElementById('vidKeyFrames').value) || 121,
 frame_rate: parseFloat(document.getElementById('vidKeyFps').value) || 24
 };
 },
 getAdvanced: () => {
 const body = {};
 if (document.getElementById('vidAdvancedKey').classList.contains('open')) {
 const steps = parseInt(document.getElementById('vidKeySteps').value);
 const seed = document.getElementById('vidKeySeed').value;
 const neg = document.getElementById('vidKeyNegativePrompt').value.trim();
 if (steps) body.num_inference_steps = steps;
 if (seed) body.seed = parseInt(seed);
 if (neg) body.negative_prompt = neg;
 }
 return body;
 }
 }
 };

 const cfg = modeMap[mode];
 const btn = document.querySelector(`#${cfg.form} .btn-generate`);
 const errorEl = document.getElementById(cfg.error);
 btn.classList.add('loading');
 errorEl.style.display = 'none';

 try {
 const body = { ...cfg.getBody(), ...cfg.getAdvanced() };
 if (!body.prompt) throw new Error('请输入 Prompt 提示词');
 // 检查自动翻译开关
 const vidAutoTL = document.getElementById('chkVideoAutoTranslate');
 if (vidAutoTL && vidAutoTL.checked) {
  body.prompt = await autoTranslatePrompt(body.prompt);
 }

 if (mode === 'image-to-video' && !body.image) throw new Error('请提供图像（URL 或上传）');
 if ((mode === 'multi-image' || mode === 'keyframes') &&
 (!body.extra_body?.image || body.extra_body.image.length < 2)) {
 throw new Error('请提供至少 2 张图像');
 }

 console.log('[Video] POST body (mode:', mode, '):', JSON.stringify(body, null, 2));

 // 通过后端代理转发（避免 CORS 问题）
 const resp = await fetch(API_HOST + '/api/video/create', {
 method: 'POST', headers: {'Content-Type': 'application/json'},
 body: JSON.stringify({...body, _api_key: apiKey})
 });
 if (!resp.ok) {
 const err = await resp.json().catch(() => ({}));
 throw new Error(err.error?.message || `HTTP ${resp.status}`);
 }

 const data = await resp.json();
 console.log('[Video] POST response:', JSON.stringify(data));

 // 使用新版 API 的 video_id
 const videoId = data.video_id || data.id;

 // Save task
 const task = {
 id: videoId,
 mode: mode,
 prompt: body.prompt.slice(0, 100),
 status: data.status || 'queued',
 progress: data.progress || 0,
 videoUrl: null,
 video_id: videoId,
 size: data.size || null,
 seconds: data.seconds || null,
 createdAt: Date.now()
 };
 videoTasks.unshift(task);
 saveTasks();

 // Start polling with video_id
 startPolling(videoId, task.mode);

 // Show in tasks tab
 switchTab('tasks');
 renderTaskList();
 showToast('视频任务已创建: ' + task.id, 'success');
 } catch (e) {
 let msg = e.message;
 // Detect Failed to Fetch
 if (msg === 'Failed to fetch' || msg.includes('Failed to fetch')) {
 msg = '网络请求失败。可能原因：\n'
 + '1. API 服务器暂时不可达，请稍后重试\n'
 + '2. 如果是 file:// 协议打开，请用本地服务器打开（运行: python -m http.server）\n'
 + '3. 上传的图片 base64 可能过大，尝试使用 URL 代替上传\n'
 + '4. 检查 API Key 是否有视频权限';
 }
 console.error('[Video] Create error:', e);
 errorEl.textContent = '❌ ' + msg;
 errorEl.style.display = 'block';
 errorEl.style.whiteSpace = 'pre-line';
 } finally {
 btn.classList.remove('loading');
 }
}

function startPolling(taskId, mode) {
 if (pollingIntervals[taskId]) return;

 let failures = 0;
 const MAX_FAILURES = 10;
 const STALE_TIMEOUT_MS = 300000; // 5分钟无进展视为超时失败

 const poll = async () => {
 try {
  const resp = await fetch(`/api/video/status/${taskId}?_api_key=${encodeURIComponent(apiKey)}`, {
   method: 'GET'
  });
  if (!resp.ok) {
   failures++;
   console.warn(`[Poll] HTTP ${resp.status} for task ${taskId} (fail ${failures}/${MAX_FAILURES})`);
   if (failures >= MAX_FAILURES) {
    console.error(`[Poll] Stopping polling for ${taskId} after ${MAX_FAILURES} failures`);
    clearInterval(pollingIntervals[taskId]);
    delete pollingIntervals[taskId];
    updateTask(taskId, { status: 'failed', error: '轮询失败次数过多' });
   }
   return;
  }
  failures = 0;

  const data = await resp.json();
  const normalizedStatus = extractTaskStatus(data);
  const normalizedProgress = data.progress ?? data.progress_percent ?? 0;
  console.log('[Poll] video', taskId, 'status:', normalizedStatus, 'progress:', normalizedProgress);

  // 完成/失败时打印完整响应，方便排查 URL 字段
  if (normalizedStatus === 'completed' || normalizedStatus === 'failed') {
   console.log('[Poll] FULL response for completed/failed:', JSON.stringify(data));
  }

  try {
   updateTask(taskId, data);
  } catch (ue) {
   console.error('[Poll] updateTask error:', ue);
  }

  // 用归一化后的状态判断终局，避免与 updateTask 的查找逻辑不一致
  if (normalizedStatus === 'completed' || normalizedStatus === 'failed') {
   clearInterval(pollingIntervals[taskId]);
   delete pollingIntervals[taskId];
   return;
  }

  // 排队/处理中超时检测：从任务创建算起超过 STALE_TIMEOUT_MS 仍无结果 → 标记失败
  const task = videoTasks.find(t => t.id === taskId);
  if (task && Date.now() - task.createdAt > STALE_TIMEOUT_MS) {
   console.warn(`[Poll] Task ${taskId} stale for > ${STALE_TIMEOUT_MS/1000}s, marking failed`);
   clearInterval(pollingIntervals[taskId]);
   delete pollingIntervals[taskId];
   updateTask(taskId, { status: 'failed', error: '任务超时：长时间无进展' });
  }
 } catch (e) {
  failures++;
  console.error(`[Poll] error for task ${taskId} (fail ${failures}/${MAX_FAILURES}):`, e);
  if (failures >= MAX_FAILURES) {
   clearInterval(pollingIntervals[taskId]);
   delete pollingIntervals[taskId];
   updateTask(taskId, { status: 'failed', error: '轮询异常: ' + e.message });
  }
 }
 };

 poll();
 pollingIntervals[taskId] = setInterval(poll, 22000);
}

/**
 * 从 API 响应中提取任务状态，兼容多种字段名和嵌套层级
 */
function extractTaskStatus(data) {
 if (!data || typeof data !== 'object') return null;
 // 直接命中
 if (data.status) return data.status;
 if (data.state) return data.state;
 // 嵌套：检查常见容器的 status/state
 for (const key of ['data', 'task', 'result']) {
  const child = data[key];
  if (child && typeof child === 'object') {
   if (child.status) return child.status;
   if (child.state) return child.state;
  }
 }
 // 数组响应：取第一个元素的 status/state
 if (Array.isArray(data) && data.length > 0) {
  const first = data[0];
  if (first && typeof first === 'object') {
   if (first.status) return first.status;
   if (first.state) return first.state;
  }
 }
 return null;
}

// Resume polling for incomplete tasks on page load
function resumeAllPolling() {
 videoTasks.forEach(t => {
 if (t.status !== 'completed' && t.status !== 'failed' && !pollingIntervals[t.id]) {
 console.log('[Poll] Resuming polling for', t.id);
 startPolling(t.id, t.mode || 'unknown');
 }
 });
}

// Deep search for video URL in nested response objects
function findVideoUrl(obj, visited = new Set()) {
 if (!obj || typeof obj !== 'object' || visited.has(obj)) return null;
 visited.add(obj);

 // Known URL-suggesting field names (case-insensitive partial match)
 const urlFields = ['url', 'video_url', 'output_url', 'download_url', 'file_url', 'src', 'link', 'href', 'path', 'video', 'output', 'remixed_from_video_id'];

 for (const [key, val] of Object.entries(obj)) {
 const lowerKey = key.toLowerCase();
 // Direct URL match: string value that looks like a URL (remote or local)
 if (typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('storage.googleapis') || val.startsWith('/'))) {
 const ext = val.split('?')[0].split('#')[0].toLowerCase();
 if (ext.endsWith('.mp4') || ext.endsWith('.webm') || ext.endsWith('.mov') || ext.endsWith('.gif') ||
 urlFields.some(f => lowerKey.includes(f))) {
 return val;
 }
 }
 // Nested object: recurse
 if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
 const found = findVideoUrl(val, visited);
 if (found) return found;
 }
 // Array: check first element
 if (Array.isArray(val)) {
 for (const item of val) {
 if (typeof item === 'string') {
 const ext = item.split('?')[0].split('#')[0].toLowerCase();
 if (ext.endsWith('.mp4') || ext.endsWith('.webm') || ext.endsWith('.mov') || ext.endsWith('.gif') ||
 item.startsWith('https://storage.googleapis.com/')) {
 return item;
 }
 } else if (typeof item === 'object' && item !== null) {
 const found = findVideoUrl(item, visited);
 if (found) return found;
 }
 }
 }
 }
 return null;
}

function updateTask(taskId, data) {
 const idx = videoTasks.findIndex(t => t.id === taskId);
 if (idx === -1) return;

 const status = extractTaskStatus(data);
 videoTasks[idx].status = status || videoTasks[idx].status;
 videoTasks[idx].progress = data.progress ?? data.progress_percent ?? 0;
 videoTasks[idx].lastPolled = Date.now();
 videoTasks[idx].pollError = null;

 // 新版 API：尝试多个可能字段名获取 video URL
 const urlFields = ['video_url', 'url', 'output_url', 'download_url', 'result_url'];
 for (const f of urlFields) {
  if (data[f] && typeof data[f] === 'string' && (data[f].startsWith('http') || data[f].startsWith('https'))) {
   console.log('[Video] Got URL from field:', f, data[f]);
   videoTasks[idx].videoUrl = data[f];
   break;
  }
 }
 // 如果顶层没找到，尝试嵌套 result 对象
 if (!videoTasks[idx].videoUrl && data.result && typeof data.result === 'object') {
  const v = data.result.video_url || data.result.url || data.result.output_url;
  if (v && typeof v === 'string' && v.startsWith('http')) {
   console.log('[Video] Got URL from result:', v);
   videoTasks[idx].videoUrl = v;
  }
 }
 // 回退：深搜整个响应的字符串值
 if (!videoTasks[idx].videoUrl) {
  videoTasks[idx].videoUrl = findVideoUrl(data);
  if (videoTasks[idx].videoUrl) console.log('[Video] Got URL via deep search:', videoTasks[idx].videoUrl);
 }

 if (data.size) videoTasks[idx].size = data.size;
 if (data.seconds) videoTasks[idx].seconds = data.seconds;
 if (data.error) videoTasks[idx].error = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
 if (status === 'completed') {
  console.log('[Video] 任务完成, videoUrl:', videoTasks[idx].videoUrl, '完整响应keys:', Object.keys(data).join(', '));
 }
 saveTasks();
 try { renderTaskList(); } catch (re) { console.error('[Render] renderTaskList error:', re); }
}

function saveTasks() {
 try { localStorage.setItem('agnes_video_tasks', JSON.stringify(videoTasks)); } catch (e) {}
}

async function refreshAllTasks() {
 for (const task of videoTasks) {
 if (task.status === 'queued' || task.status === 'in_progress') {
 try {
 const resp = await fetch(`/api/video/status/${task.id}?_api_key=${encodeURIComponent(apiKey)}`, {
  method: 'GET'
 });
 if (resp.ok) {
 const data = await resp.json();
 updateTask(task.id, data);
 const normalizedStatus = extractTaskStatus(data);
 if (normalizedStatus === 'completed' || normalizedStatus === 'failed') {
 if (pollingIntervals[task.id]) {
 clearInterval(pollingIntervals[task.id]);
 delete pollingIntervals[task.id];
 }
 } else if (!pollingIntervals[task.id]) {
 startPolling(task.id, task.mode);
 }
 }
 } catch (e) {}
 }
 }
 renderTaskList();
 showToast('任务列表已刷新', 'success');
}

function checkTask(taskId) {
 const task = videoTasks.find(t => t.id === taskId);
 if (!task) return;
 if (task.status === 'completed' && task.videoUrl) {
 showVideoResult(task.videoUrl);
 }
}

function showVideoResult(url) {
 // 视频面板的结果区
 const resultArea = document.getElementById('vidResult');
 const video = document.getElementById('vidResultVideo');
 const urlArea = document.getElementById('vidResultUrlArea');
 if (resultArea && video) {
  video.src = url;
  resultArea.style.display = 'block';
  resultArea.classList.add('show');
  if (document.getElementById('vidResultUrl')) document.getElementById('vidResultUrl').value = url;
  if (urlArea) urlArea.style.display = '';
 }
 // 任务面板的结果区
 const taskResult = document.getElementById('taskResult');
 const taskVideo = document.getElementById('taskResultVideo');
 if (taskResult && taskVideo) {
  taskVideo.src = url;
  taskResult.style.display = 'block';
  taskResult.classList.add('show');
 }
 switchTab('video');
 showToast('✅ 视频已就绪', 'success');
}

function deleteTask(taskId) {
 if (pollingIntervals[taskId]) {
 clearInterval(pollingIntervals[taskId]);
 delete pollingIntervals[taskId];
 }
 videoTasks = videoTasks.filter(t => t.id !== taskId);
 saveTasks();
 renderTaskList();
}

function inspectTaskResponse(taskId) {
 const task = videoTasks.find(t => t.id === taskId);
 if (!task || !task.rawResponse) {
 showToast('无原始响应数据', 'error');
 return;
 }
 const json = JSON.stringify(task.rawResponse, null, 2);
 const w = window.open('', '_blank', 'width=700,height=600');
 w.document.write(`<pre style="background:#0e1017;color:#e8e9ed;padding:20px;font-family:monospace;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-all;margin:0;min-height:100vh;">任务: ${taskId}\n状态: ${task.status}\n已捕获URL: ${task.videoUrl || '(无)'}\n\n=== API 原始响应 ===\n${json.replace(/</g,'&lt;')}</pre>`);
 w.document.title = 'API Response - ' + taskId;
 showToast('已在弹出窗口打开', 'success');
}

async function tryDownloadTask(taskId) {
 const task = videoTasks.find(t => t.id === taskId);
 if (!task) return;

 if (task.videoUrl) {
  showToast('视频URL已就绪', 'success');
  try { navigator.clipboard?.writeText(task.videoUrl); } catch (e) {}
  return;
 }

 // 回退：重新查询状态获取 video_url
 showToast('重新查询视频状态…', 'success');
 try {
  const resp = await fetch(`/api/video/status/${taskId}?_api_key=${encodeURIComponent(apiKey)}`);
  if (resp.ok) {
   const data = await resp.json();
   updateTask(taskId, data);
   // 重新从 task 对象读取（updateTask 可能已设置 videoUrl）
   const updated = videoTasks.find(t => t.id === taskId);
   if (updated && updated.videoUrl) {
    showToast('找到视频URL!', 'success');
    return;
   }
   // 直接检查返回数据
   const url = data.video_url || data.url || data.output_url ||
    (data.result && (data.result.video_url || data.result.url));
   if (url && typeof url === 'string' && url.startsWith('http')) {
    updated.videoUrl = url;
    saveTasks();
    renderTaskList();
    showToast('找到视频URL!', 'success');
    return;
   }
  }
 } catch (e) {
  console.log('[Download] error:', e.message);
 }
 showToast('视频尚未生成完成', 'error');
}

function clearAllTasks() {
 Object.keys(pollingIntervals).forEach(id => {
 clearInterval(pollingIntervals[id]);
 });
 pollingIntervals = {};
 videoTasks = videoTasks.filter(t => t.status === 'queued' || t.status === 'in_progress');
 saveTasks();
 renderTaskList();
}

function renderTaskList() {
 const container = document.getElementById('taskList');
 if (videoTasks.length === 0) {
 container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;">暂无任务</div>';
 return;
 }
 container.innerHTML = videoTasks.map(t => `
 <div class="task-item">
 <div class="task-info">
 <div class="task-id">${t.id}</div>
 <div class="task-prompt">${t.prompt}</div>
 <div class="task-progress"><div class="task-progress-bar" style="width:${t.progress}%"></div></div>
 <div class="task-meta">${elapsedTime(t.createdAt)} ${t.progress > 0 ? '· ' + t.progress + '%' : ''}</div>
 </div>
 <div class="task-status">
 <span class="status-dot ${t.status}"></span>
 ${statusLabel(t.status)}
 ${t.pollError ? `<span style="font-size:10px;color:var(--accent-orange);margin-left:4px;">⚠️ ${t.pollError}</span>` : ''}
 ${t.status === 'completed' && !t.videoUrl ? '<span style="font-size:10px;color:var(--accent-orange);margin-left:4px;">⚠️ 未获取URL</span>' : ''}
 </div>
 <div class="task-actions">
 ${t.status === 'completed' && t.videoUrl ? `<button class="btn-task" onclick="showVideoResult(\`${t.videoUrl.replace(/\\/g,'\\\\').replace(/\`/g,'\\`')}\`)">▶ 播放</button>` : ''}
 ${t.status === 'completed' && !t.videoUrl ? `<button class="btn-task" onclick="tryDownloadTask('${t.id}')" style="color:var(--accent-orange);border-color:rgba(255,158,100,0.3);" title="尝试从API获取下载URL">📥 获取</button>` : ''}
 ${t.rawResponse ? `<button class="btn-task" onclick="inspectTaskResponse('${t.id}')" title="查看API原始响应">🔍</button>` : ''}
 <button class="btn-task" onclick="refreshSingleTask('${t.id}')">🔄</button>
 <button class="btn-task delete" onclick="deleteTask('${t.id}')">🗑️</button>
 </div>
 </div>
 `).join('');
}

async function refreshSingleTask(taskId) {
 try {
  const resp = await fetch(`/api/video/status/${taskId}?_api_key=${encodeURIComponent(apiKey)}`, {
   method: 'GET'
  });
 if (resp.ok) {
 const data = await resp.json();
 updateTask(taskId, data);
 if (data.status !== 'completed' && data.status !== 'failed' && !pollingIntervals[taskId]) {
 startPolling(taskId, data.mode || 'unknown');
 }
 showToast('已刷新', 'success');
 }
 } catch (e) {
 showToast('刷新失败', 'error');
 }
}

function statusLabel(s) {
 const map = {
 queued: '排队中', in_progress: '生成中', completed: '已完成', failed: '失败'
 };
 return map[s] || s;
}

function elapsedTime(createdAt) {
 const diff = Date.now() - createdAt;
 if (diff < 60000) return Math.floor(diff / 1000) + '秒';
 if (diff < 3600000) return Math.floor(diff / 60000) + '分' + Math.floor((diff % 60000) / 1000) + '秒';
 return Math.floor(diff / 3600000) + '小时';
}

function inspectTaskResponse(taskId) {
 const task = videoTasks.find(t => t.id === taskId);
 if (!task || !task.rawResponse) {
 showToast('无原始响应数据', 'error');
 return;
 }
 const json = JSON.stringify(task.rawResponse, null, 2);
 const w = window.open('', '_blank', 'width=700,height=600');
 w.document.write(`<pre style="background:#111;color:#e8e9ed;padding:16px;font-family:monospace;white-space:pre-wrap;word-break:break-all;">${json.replace(/</g,'&lt;')}</pre>`);
}

// ========== PROMPT ENHANCEMENT ==========
async function enhancePrompt(type) {
 const map = {
 'image': { btn: 'imageFormT2I', input: 'imgPrompt', output: 'imgEnhancedPrompt' },
 'i2i': { btn: 'imageFormI2I', input: 'imgI2iPrompt', output: 'imgI2iEnhancedPrompt' },
 'video': { btn: 'videoFormT2V', input: 'vidPrompt', output: 'vidEnhancedPrompt' },
 'i2v': { btn: 'videoFormI2V', input: 'vidI2vPrompt', output: 'vidI2vEnhancedPrompt' },
 'multi': { btn: 'videoFormMulti', input: 'vidMultiPrompt', output: 'vidMultiEnhancedPrompt' },
 'keyframes': { btn: 'videoFormKeyframes', input: 'vidKeyPrompt', output: 'vidKeyEnhancedPrompt' }
 };
 const cfg = map[type];
 if (!cfg) return;

 const inputEl = document.getElementById(cfg.input);
 const outputEl = document.getElementById(cfg.output);
 const btn = document.querySelector(`#${cfg.btn} .btn-enhance`);
 const originalPrompt = inputEl.value.trim();

 if (!originalPrompt) {
 showToast('请先输入提示词', 'error');
 return;
 }

 btn.disabled = true;
 btn.textContent = '⏳ 优化中...';
 outputEl.classList.remove('show');

 try {
 const systemPrompts = {
 'image': '你是一个专业的 AI 图像生成提示词优化器。根据用户简短描述，生成完整详细的高质量英文提示词，包含：主体、场景/环境、风格、光照、构图、镜头角度和画质要求。直接返回优化后的英文提示词，不要解释。',
 'i2i': '你是一个专业的图生图提示词优化器。根据用户描述，生成两个部分的英文提示词：1)需要改变什么 2)需要保持什么不变(原始构图和主体)。直接返回优化后的英文提示词，不要解释。',
 'video': '你是一个专业的视频生成提示词优化器。生成结构完整的英文提示词：[主体] + [动作] + [场景] + [镜头运动] + [光照] + [风格]。加入电影感描述。直接返回优化后的英文提示词，不要解释。',
 'i2v': '你是一个专业的图生视频提示词优化器。生成描述图像动画化的英文提示词：哪些元素需要运动，同时保持主体稳定。直接返回优化后的英文提示词，不要解释。',
 'multi': '你是一个专业的多图视频提示词优化器。生成描述多张参考图之间过渡关系的英文提示词。直接返回优化后的英文提示词，不要解释。',
 'keyframes': '你是一个专业的关键帧动画提示词优化器。生成描述关键帧之间平滑过渡的英文提示词，强调视觉一致性和电影感。直接返回优化后的英文提示词，不要解释。'
 };

 const resp = await fetch(API_HOST + '/api/chat/completions', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
   _api_key: apiKey,
   model: 'agnes-2.0-flash',
   messages: [
    { role: 'system', content: systemPrompts[type] },
    { role: 'user', content: `请优化以下提示词: ${originalPrompt}` }
   ],
   temperature: 0.7,
   max_tokens: 500
  })
 });

 if (!resp.ok) {
 const err = await resp.json().catch(() => ({}));
 throw new Error(err.error?.message || `HTTP ${resp.status}`);
 }

 const data = await resp.json();
 const enhanced = data.choices?.[0]?.message?.content || '';
 outputEl.textContent = enhanced;
 outputEl.dataset.enhancedText = enhanced;
 outputEl.classList.add('show');

 // Add apply button
 if (!outputEl.querySelector('.btn-apply')) {
 const applyBtn = document.createElement('button');
 applyBtn.className = 'btn-save-key';
 applyBtn.style.cssText = 'margin-top:8px;font-size:12px;';
 applyBtn.textContent = '✅ 应用优化提示词';
 applyBtn.onclick = () => {
 document.getElementById(cfg.input).value = outputEl.dataset.enhancedText || '';
 outputEl.classList.remove('show');
 showToast('提示词已应用', 'success');
 };
 outputEl.appendChild(applyBtn);
 }
 } catch (e) {
 showToast('优化失败: ' + e.message, 'error');
 } finally {
 btn.disabled = false;
 btn.textContent = '✨ AI 优化提示词';
 }
}

// ========== UTILS ==========
function copyUrl(inputId) {
 const el = document.getElementById(inputId);
 el.select();
 document.execCommand('copy');
 showToast('已复制到剪贴板', 'success');
}

function showToast(msg, type) {
 const existing = document.querySelector('.toast');
 if (existing) existing.remove();
 const toast = document.createElement('div');
 toast.className = `toast ${type}`;
 toast.textContent = msg;
 document.body.appendChild(toast);
 setTimeout(() => toast.remove(), 3000);
}

// ========== INIT RENDER ==========
renderImageGallery();
resumeAllPolling();

// Auto-refresh agent counts on load
setTimeout(() => {
 fetch(API_HOST + '/api/agent/memory').then(r=>r.json()).then(d => {
  const el = document.getElementById('memoryCount');
  if (el) el.textContent = d.context_messages || 0;
 }).catch(()=>{});
 fetch(API_HOST + '/api/agent/knowledge').then(r=>r.json()).then(d => {
  const el = document.getElementById('knowledgeCount');
  if (el) el.textContent = d.total || 0;
 }).catch(()=>{});
 fetch(API_HOST + '/api/agent/skills/stats').then(r=>r.json()).then(d => {
  const el = document.getElementById('skillsCount');
  if (el) el.textContent = d.total || 0;
 }).catch(()=>{});
}, 1000);

// Handle video duration/fps live update for all video forms
['t2v','i2v','multi','key'].forEach(m => {
  const prefix = m === 't2v' ? '' : 'vidI2v';
  const durEl = document.getElementById((m==='t2v'?'':m==='i2v'?'vidI2v':m==='multi'?'vidMulti':'vidKey')+'Duration');
  const fpsEl = document.getElementById((m==='t2v'?'':m==='i2v'?'vidI2v':m==='multi'?'vidMulti':'vidKey')+'Fps');
  if (durEl) durEl.addEventListener('change', () => updateVidParams(m));
  if (fpsEl) fpsEl.addEventListener('change', () => updateVidParams(m));
});

function updateImgModelHint() {
 const model = document.getElementById('imgModel').value;
 const hint = document.getElementById('imgModelHint');
 if (model === 'agnes-image-2.0-flash') {
 hint.textContent = '2.0-flash：图生图/多图合成更强，自动添加 img2img tags';
 } else {
 hint.textContent = '2.1-flash：适合文生图，高细节密度';
 }
}


// ========== API 配置弹窗 & 模型配置 ==========
// (Added by codex - Phase 2)

function openApiConfig() {
  var overlay = document.getElementById('apiConfigOverlay');
  if (!overlay) return;
  loadApiConfig();
  overlay.classList.add('show');
}

function hideApiConfig(e) {
  if (e && e.target !== document.getElementById('apiConfigOverlay')) return;
  var overlay = document.getElementById('apiConfigOverlay');
  if (overlay) overlay.classList.remove('show');
}

async function loadApiConfig() {
  try {
    var resp = await fetch(API_HOST + '/api/config/models');
    var data = await resp.json();
    var models = data.models || {};
    var apiBase = data.api_base || 'https://apihub.agnes-ai.com/v1';
    var baseEl = document.getElementById('setApiBase');
    if (baseEl) baseEl.value = apiBase;
    var chat = models.chat || {};
    var chatModel = document.getElementById('setModelChat');
    var chatTemp = document.getElementById('setModelChatTemp');
    var chatMax = document.getElementById('setModelChatMax');
    if (chatModel) chatModel.value = chat.model || 'agnes-2.0-flash';
    if (chatTemp) chatTemp.value = (chat.temperature != null) ? chat.temperature : 0.7;
    if (chatMax) chatMax.value = chat.max_tokens || 4096;
    var imgModel = document.getElementById('setModelImage');
    if (imgModel) imgModel.value = (models.image || {}).model || 'agnes-image-2.1-flash';
    var vidModel = document.getElementById('setModelVideo');
    if (vidModel) vidModel.value = (models.video || {}).model || 'agnes-video-v2.0';
    var agent = models.agent || {};
    var agentModel = document.getElementById('setModelAgent');
    var agentSteps = document.getElementById('setModelAgentSteps');
    var agentReasoning = document.getElementById('setModelAgentReasoning');
    var agentThinking = document.getElementById('setModelAgentThinking');
    if (agentModel) agentModel.value = agent.model || 'agnes-2.0-flash';
    if (agentSteps) agentSteps.value = agent.max_steps || 20;
    if (agentReasoning) agentReasoning.value = agent.reasoning_effort || 'high';
    if (agentThinking) agentThinking.checked = !!agent.enable_thinking;
    var dot = document.getElementById('apiStatusDot');
    if (typeof window.modelConfig !== 'undefined') window.modelConfig = models;
    if (dot) {
      dot.style.background = apiKey ? 'var(--accent-green)' : 'var(--accent-red)';
      dot.title = apiKey ? 'API Key 已配置' : 'API Key 未配置';
    }
  } catch(e) { console.warn('[API Config] load failed:', e); }
}

async function saveApiConfig() {
  try {
    var models = {
      chat: {
        model: document.getElementById('setModelChat')?.value || 'agnes-2.0-flash',
        temperature: parseFloat(document.getElementById('setModelChatTemp')?.value) || 0.7,
        max_tokens: parseInt(document.getElementById('setModelChatMax')?.value) || 4096
      },
      image: { model: document.getElementById('setModelImage')?.value || 'agnes-image-2.1-flash' },
      video: { model: document.getElementById('setModelVideo')?.value || 'agnes-video-v2.0' },
      agent: {
        model: document.getElementById('setModelAgent')?.value || 'agnes-2.0-flash',
        max_steps: parseInt(document.getElementById('setModelAgentSteps')?.value) || 20,
        reasoning_effort: document.getElementById('setModelAgentReasoning')?.value || 'high',
        enable_thinking: document.getElementById('setModelAgentThinking')?.checked || false
      }
    };
    var api_base = document.getElementById('setApiBase')?.value || 'https://apihub.agnes-ai.com/v1';
    var resp = await fetch(API_HOST + '/api/config/models', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({models: models, api_base: api_base})
    });
    var data = await resp.json();
    if (data.ok) {
      showToast('API 配置已保存', 'success');
      if (data.models) {
        var imgDisplay = document.getElementById('imgModelDisplay');
        if (imgDisplay) imgDisplay.textContent = data.models.image?.model || 'agnes-image-2.1-flash';
        var chatDisplay = document.getElementById('chatModelDisplay');
        if (chatDisplay) chatDisplay.textContent = data.models.chat?.model || 'agnes-2.0-flash';
      }
    } else {
      showToast('保存失败: ' + (data.error || '未知错误'), 'error');
    }
  } catch(e) { showToast('保存失败: ' + e.message, 'error'); }
}

// ========== Agent Executor ==========
// AI Agent with tool calling - uses Agnes native function calling

const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "image_generate",
      description: "Generate image from text prompt",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Image description" },
          size: { type: "string", description: "Size like 1024x1024, 1152x768", default: "1152x768" }
        },
        required: ["prompt"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "video_create",
      description: "Create video from text prompt",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Video content description" },
          duration: { type: "number", description: "Duration in seconds", default: 5 }
        },
        required: ["prompt"]
      }
    }
  }
];

async function executeAgent(userQuery, sessionMessages, onEvent, onComplete, onError) {
  const maxSteps = 10;
  let messages = [];
  messages.push({
    role: "system",
    content: "You are an AI creative assistant agent. You can call tools to complete multi-step creative tasks.\n" +
      "Available tools:\n" +
      "1. image_generate - Generate images from text\n" +
      "2. video_create - Create videos from text\n" +
      "Plan your steps and call tools one at a time."
  });
  sessionMessages.forEach(m => messages.push({ role: m.role, content: m.content }));
  messages.push({ role: "user", content: userQuery });

  for (let step = 1; step <= maxSteps; step++) {
    onEvent({ type: "step_start", step: step });
    try {
      const model = (window.modelConfig && window.modelConfig.agent && window.modelConfig.agent.model) || 'agnes-2.0-flash';
      const apiBase = (typeof window.apiBase !== 'undefined') ? window.apiBase : DIRECT_BASE;
      const body = {
        model: model,
        messages: messages,
        tools: AGENT_TOOLS,
        tool_choice: "auto",
        temperature: 0.7,
        max_tokens: 4096,
        stream: false
      };
      const resp = await fetch(apiBase + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({}, body, { _api_key: apiKey }))
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "HTTP " + resp.status);
      }
      const data = await resp.json();
      const choice = data.choices && data.choices[0];
      if (!choice) throw new Error("Empty response");
      if (choice.finish_reason === "stop" || !choice.message || !choice.message.tool_calls) {
        messages.push({ role: "assistant", content: choice.message ? choice.message.content : "" });
        onEvent({ type: "complete", content: choice.message ? choice.message.content : "" });
        onComplete(choice.message ? choice.message.content : "");
        return;
      }
      messages.push({ role: "assistant", content: (choice.message && choice.message.content) || "", tool_calls: choice.message.tool_calls });
      for (const tc of choice.message.tool_calls) {
        const toolName = tc.function.name;
        const toolArgs = JSON.parse(tc.function.arguments || "{}");
        onEvent({ type: "tool_start", tool: toolName, args: toolArgs });
        try {
          let toolResult;
          if (toolName === "image_generate") {
            const imgModel = (window.modelConfig && window.modelConfig.image && window.modelConfig.image.model) || 'agnes-image-2.1-flash';
            const imgResp = await fetch(API_HOST + "/api/image/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ _api_key: apiKey, model: imgModel, prompt: toolArgs.prompt, size: toolArgs.size || "1152x768", extra_body: { response_format: "url" } })
            });
            const imgData = await imgResp.json();
            const url = (imgData.choices && imgData.choices[0] && imgData.choices[0].message && imgData.choices[0].message.content) || (imgData.data && imgData.data[0] && imgData.data[0].url);
            if (!url) throw new Error("Image generation failed");
            toolResult = { url: url, type: "image" };
          } else if (toolName === "video_create") {
            const vidModel = (window.modelConfig && window.modelConfig.video && window.modelConfig.video.model) || 'agnes-video-v2.0';
            const vidResp = await fetch(API_HOST + "/api/video/create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ _api_key: apiKey, model: vidModel, prompt: toolArgs.prompt, width: 1152, height: 768, num_frames: Math.min(441, Math.max(1, Math.round((toolArgs.duration || 5) * 24))) })
            });
            const vidData = await vidResp.json();
            if (!vidData.id) throw new Error("Video task creation failed");
            toolResult = { task_id: vidData.id, type: "video" };
          } else {
            throw new Error("Unknown tool: " + toolName);
          }
          onEvent({ type: "tool_end", tool: toolName, result: toolResult });
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(toolResult) });
        } catch (toolErr) {
          onEvent({ type: "tool_error", tool: toolName, error: toolErr.message });
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ error: toolErr.message }) });
        }
      }
    } catch (e) {
      onError(e.message);
      return;
    }
  }
  onError("Max steps reached");
}
