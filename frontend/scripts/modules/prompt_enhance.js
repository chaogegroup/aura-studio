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
   model: window.modelConfig?.chat?.model || 'agnes-2.0-flash',
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
