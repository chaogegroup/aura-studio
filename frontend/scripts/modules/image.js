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
 model: (window.modelConfig?.image?.model || 'agnes-image-2.1-flash'),
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
 console.error('[T2I]', e);
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
 model: (window.modelConfig?.image?.model || 'agnes-image-2.1-flash'),
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

 if (typeof imageUrl !== 'string') return;
 if (!imageUrl.startsWith('http') && !imageUrl.startsWith('data:')) {
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

