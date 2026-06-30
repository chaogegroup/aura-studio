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

// ========== 视频时长自动计算 ==========
function updateVidParams(mode) {
  const prefix = mode === 't2v' ? 'vid' : mode === 'i2v' ? 'vidI2v' : mode === 'multi' ? 'vidMulti' : 'vidKey';
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