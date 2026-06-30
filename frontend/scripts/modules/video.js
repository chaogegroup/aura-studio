async function createVideoTask(mode) {
 const modeMap = {
 'text-to-video': {
 form: 'videoFormT2V', error: 'vidError',
 getBody: () => ({
 model: (window.modelConfig?.video?.model || 'agnes-video-v2.0'),
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
        model: (window.modelConfig?.video?.model || 'agnes-video-v2.0'),
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
 model: (window.modelConfig?.video?.model || 'agnes-video-v2.0'),
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
 model: (window.modelConfig?.video?.model || 'agnes-video-v2.0'),
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
  const resp = await fetch(API_HOST + `/api/video/status/${taskId}?_api_key=${encodeURIComponent(apiKey)}`, {
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
 const urlFields = ['video_url', 'url', 'output_url', 'download_url', 'result_url', 'remixed_from_video_id'];
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
 const resp = await fetch(API_HOST + `/api/video/status/${task.id}?_api_key=${encodeURIComponent(apiKey)}`, {
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
  const resp = await fetch(API_HOST + `/api/video/status/${taskId}?_api_key=${encodeURIComponent(apiKey)}`);
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
  const resp = await fetch(API_HOST + `/api/video/status/${taskId}?_api_key=${encodeURIComponent(apiKey)}`, {
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

// ========== UTILS ==========
function copyUrl(inputId) {
 const el = document.getElementById(inputId);
 el.select();
 document.execCommand('copy');
 showToast('已复制到剪贴板', 'success');
}


function inspectTaskResponse(taskId) {
  const task = videoTasks.find(t => t.id === taskId);
  if (!task || !task.rawResponse) return void showToast("无原始响应数据", "error");
  const raw = JSON.stringify(task.rawResponse, null, 2);
  const w = window.open("", "_blank", "width=700,height=600");
  if (!w) return void showToast("弹窗被拦截，请允许弹窗后重试", "error");
  w.document.write(`<pre style="background:#0e1017;color:#e8e9ed;padding:20px;font-family:monospace;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-all;margin:0;min-height:100vh;">任务: ${taskId}\n状态: ${task.status}\n已获取URL: ${task.videoUrl || "(无)"}\n\n=== API 原始响应 ===\n${raw.replace(/</g, "&lt;")}</pre>`);
  w.document.title = "API Response - " + taskId;
}

