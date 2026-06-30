// ========== Agent 管理面板 ==========
// 提供左侧栏「记忆 / 知识库 / 技能 / 进化日志」四个入口的弹窗逻辑。
// 显示机制统一使用 .show class（与 aboutOverlay/settingsOverlay 等保持一致）。
//
// 依赖全局：API_HOST, escapeHtml, showToast（均在 app.js / modules 中定义）。

// ========== 面板显隐 ==========

function showAgentPanel(tab) {
  tab = tab || 'memory';
  const overlay = document.getElementById('agentPanelOverlay');
  if (!overlay) return;
  // 关闭其它弹窗，再打开本面板（与其它 show* 函数一致）
  document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('show'));
  overlay.classList.add('show');

  const content = document.getElementById('agentPanelContent');
  if (!content) return;
  // 渲染统一的 tab 栏
  const tabs = [
    { id: 'memory',    label: '🧠 记忆' },
    { id: 'knowledge', label: '📚 知识库' },
    { id: 'skills',    label: '🧩 技能' },
    { id: 'evolution', label: '🔄 进化' }
  ];
  content.innerHTML =
    '<h2 style="font-size:17px;margin:0 0 12px;color:var(--text-primary);">🧠 Agent 管理</h2>' +
    '<div style="display:flex;gap:6px;margin-bottom:16px;border-bottom:1px solid var(--border);padding-bottom:10px;flex-wrap:wrap;">' +
      tabs.map(t => `<button onclick="showAgentPanel('${t.id}')" style="padding:6px 14px;font-size:12px;border:none;border-radius:6px;cursor:pointer;background:${t.id===tab?'var(--accent-blue)':'var(--bg-surface)'};color:${t.id===tab?'#fff':'var(--text-secondary)'};font-weight:${t.id===tab?'600':'400'};">${t.label}</button>`).join('') +
    '</div>' +
    '<div id="agentPanelBody"><div style="text-align:center;color:var(--text-muted);padding:30px;font-size:12px;">加载中…</div></div>';

  // 按需刷新对应 tab 内容
  if (tab === 'memory') refreshMemory();
  else if (tab === 'knowledge') refreshKnowledge();
  else if (tab === 'skills') refreshSkills();
  else if (tab === 'evolution') refreshEvolution();
}

function hideAgentPanel(event) {
  if (event && event.target !== document.getElementById('agentPanelOverlay')) return;
  const overlay = document.getElementById('agentPanelOverlay');
  if (overlay) overlay.classList.remove('show');
}

// ========== 记忆 ==========

async function refreshMemory() {
  const body = document.getElementById('agentPanelBody');
  if (!body) return;
  try {
    const [resp, ctxResp] = await Promise.all([
      fetch(API_HOST + '/api/agent/memory'),
      fetch(API_HOST + '/api/agent/memory/context')
    ]);
    const stats = await resp.json();
    const ctx = await ctxResp.json();

    // 向量记忆状态提示
    const vecOn = !!stats.vector_available;
    const vecChunks = stats.vector_chunks || 0;
    const vecHint = vecOn
      ? `<div style="padding:8px 10px;background:rgba(68,238,187,0.08);border:1px solid var(--accent-green);border-radius:6px;font-size:11px;color:var(--accent-green);margin-bottom:10px;">✅ 向量记忆已启用（已索引 <strong>${vecChunks}</strong> 条向量）。语义检索工作中。</div>`
      : `<div style="padding:8px 10px;background:rgba(255,159,100,0.08);border:1px solid var(--accent-orange);border-radius:6px;font-size:11px;color:var(--accent-orange);margin-bottom:10px;">⚠️ 向量记忆未启用（未配置 Embedding）。当前仅用关键词检索。前往「设置 → 向量记忆」配置后重启会话即可生效。</div>`;

    body.innerHTML =
      vecHint +
      `<div id="memoryStats" style="padding:10px;background:var(--bg-surface);border-radius:6px;font-size:12px;line-height:1.9;">
        <div>上下文消息: <strong>${stats.context_messages ?? 0}</strong></div>
        <div>核心字段: <strong>${stats.core_fields ?? 0}</strong></div>
        <div>每日记录: <strong>${stats.daily_files ?? 0}</strong></div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:4px;word-break:break-all;">存储位置：${escapeHtml(stats.memory_dir || '')}</div>
      </div>
      <button onclick="clearMemory()" style="margin-top:10px;width:100%;padding:8px;font-size:12px;border:1px solid var(--accent-red);border-radius:6px;background:transparent;color:var(--accent-red);cursor:pointer;">🗑️ 清空上下文记忆</button>
      <div style="margin-top:14px;font-size:11px;color:var(--text-muted);">最近对话：</div>
      <div id="memoryList" style="margin-top:6px;"></div>`;
    document.getElementById('memoryList').innerHTML =
      (ctx || []).slice(-10).map(m =>
        `<div style="padding:6px 8px;margin-bottom:4px;background:var(--bg-surface);border-radius:4px;border-left:3px solid ${m.role === 'user' ? 'var(--accent-blue)' : 'var(--accent-green)'};font-size:11px;">
          <span style="color:${m.role === 'user' ? 'var(--accent-blue)' : 'var(--accent-green)'};font-weight:600;">${m.role === 'user' ? '👤' : '✨'} ${escapeHtml(m.role || '')}</span>
          <div style="color:var(--text-secondary);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(typeof m.content === 'string' ? m.content.slice(0, 80) : (Array.isArray(m.content) ? '[多模态]' : ''))}</div>
        </div>`
      ).join('') || '<div style="font-size:11px;color:var(--text-muted);padding:8px;">暂无对话记录</div>';
    const el = document.getElementById('memoryCount');
    if (el) el.textContent = stats.context_messages ?? 0;
  } catch (e) {
    body.innerHTML = `<div style="color:var(--accent-red);font-size:12px;padding:20px;">加载失败: ${escapeHtml(e.message)}</div>`;
    console.error(e);
  }
}

async function clearMemory() {
  if (!confirm('确定要清空上下文记忆吗？')) return;
  try {
    await fetch(API_HOST + '/api/agent/memory/context', { method: 'DELETE' });
    showToast('上下文记忆已清空', 'success');
    refreshMemory();
  } catch (e) { console.error(e); showToast('清空失败: ' + e.message, 'error'); }
}

// ========== 知识库 ==========

async function refreshKnowledge() {
  const body = document.getElementById('agentPanelBody');
  if (!body) return;
  try {
    const [statsResp, treeResp] = await Promise.all([
      fetch(API_HOST + '/api/agent/knowledge'),
      fetch(API_HOST + '/api/agent/knowledge/entries')
    ]);
    const stats = await statsResp.json();
    const treeData = await treeResp.json();

    const byCat = stats.by_category || {};
    const catLabels = {entities:'人物/公司/项目', concepts:'技术概念/方法论', sources:'文章/链接/文档摘要', analysis:'深度讨论/方案', creation:'创作设定'};
    const catList = Object.keys(byCat).map(k => `${catLabels[k]||k}: <strong>${byCat[k]}</strong>`).join(' | ') || '（暂无分类）';

    // 构建目录树 HTML
    let treeHtml = '';
    if (treeData.tree && treeData.tree.length) {
      treeHtml = treeData.tree.map(node => {
        if (!node.files || !node.files.length) return '';
        return `<div style="margin-bottom:4px;">
          <div onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'" style="cursor:pointer;padding:6px 10px;background:var(--bg-surface);border-radius:6px;font-size:12px;font-weight:600;color:var(--accent-purple);display:flex;align-items:center;gap:6px;border:1px solid var(--border);">
            📁 ${catLabels[node.dir]||node.dir} <span style="margin-left:auto;font-size:10px;color:var(--text-muted);">${node.files.length} 篇</span>
          </div>
          <div style="display:none;padding:4px 0 0 12px;">${node.files.map(f => `<div onclick="readKnowledgePage('${node.dir}/${f.name.replace('.md','')}')" style="cursor:pointer;padding:4px 8px;margin-bottom:2px;font-size:11px;color:var(--text-secondary);border-radius:4px;display:flex;align-items:center;gap:6px;"><span style="color:var(--text-muted);font-size:9px;">📄</span> ${escapeHtml(f.title)} <span style="margin-left:auto;font-size:9px;color:var(--text-muted);">${formatSize(f.size)}</span></div>`).join('')}</div>
        </div>`;
      }).filter(Boolean).join('');
    } else {
      treeHtml = '<div style="font-size:11px;color:var(--text-muted);padding:12px;">暂无知识页。在对话中让 AI 记录结构化知识，会自动写入知识库。</div>';
    }

    body.innerHTML =
      `<div id="knowledgeStats" style="padding:10px;background:var(--bg-surface);border-radius:6px;font-size:12px;line-height:1.9;">
        <div>总页数: <strong>${stats.total_pages ?? 0}</strong> | 总大小: <strong>${formatSize(stats.total_size || 0)}</strong></div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${catList}</div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
          <button onclick="showKnowledgeSearch()" style="padding:4px 10px;font-size:11px;border:1px solid var(--border);border-radius:4px;background:var(--bg-card);color:var(--text-primary);cursor:pointer;">🔍 搜索</button>
          <button onclick="showKnowledgeGraph()" style="padding:4px 10px;font-size:11px;border:1px solid var(--accent-purple);border-radius:4px;background:var(--bg-card);color:var(--accent-purple);cursor:pointer;">🕸️ 知识图谱</button>
        </div>
      </div>
      <div style="margin-top:14px;font-size:11px;color:var(--text-muted);">📚 知识目录：</div>
      <div id="knowledgeTree" style="margin-top:6px;">${treeHtml}</div>
      <div id="knowledgePageView" style="display:none;margin-top:8px;"></div>`;
    const el = document.getElementById('knowledgeCount');
    if (el) el.textContent = stats.total_pages ?? 0;
  } catch (e) {
    body.innerHTML = `<div style="color:var(--accent-red);font-size:12px;padding:20px;">加载失败: ${escapeHtml(e.message)}</div>`;
    console.error(e);
  }
}

async function readKnowledgePage(path) {
  const view = document.getElementById('knowledgePageView');
  if (!view) return;
  try {
    view.style.display = 'block';
    view.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;">加载中…</div>';
    const resp = await fetch(API_HOST + '/api/agent/knowledge/read?path=' + encodeURIComponent(path + '.md'));
    const data = await resp.json();
    if (data.error) { view.innerHTML = `<div style="color:var(--accent-red);font-size:11px;padding:10px;">${escapeHtml(data.error)}</div>`; return; }
    view.innerHTML =
      `<div style="background:var(--bg-surface);border-radius:6px;border:1px solid var(--border);padding:12px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="font-size:12px;font-weight:600;color:var(--text-primary);">📄 ${escapeHtml(path)}</span>
          <button onclick="closeKnowledgePageView()" style="margin-left:auto;font-size:10px;padding:2px 8px;border:1px solid var(--border);border-radius:4px;background:transparent;color:var(--text-muted);cursor:pointer;">关闭</button>
        </div>
        <pre style="font-size:11px;color:var(--text-secondary);line-height:1.6;white-space:pre-wrap;max-height:300px;overflow-y:auto;margin:0;font-family:inherit;">${escapeHtml(data.content || '')}</pre>
      </div>`;
  } catch (e) { view.innerHTML = `<div style="color:var(--accent-red);font-size:11px;padding:10px;">读取失败: ${escapeHtml(e.message)}</div>`; }
}

function closeKnowledgePageView() {
  const view = document.getElementById('knowledgePageView');
  if (view) { view.style.display = 'none'; view.innerHTML = ''; }
}

function showKnowledgeSearch() {
  const body = document.getElementById('agentPanelBody');
  if (!body) return;
  body.innerHTML =
    `<h3 style="font-size:14px;color:var(--accent-blue);margin:0 0 12px;">🔍 搜索知识库</h3>
    <div style="display:flex;gap:8px;margin-bottom:12px;">
      <input id="knowledgeSearchInput" class="modal-input" placeholder="输入关键词…" style="flex:1;" onkeydown="if(event.key==='Enter')doKnowledgeSearch()">
      <button onclick="doKnowledgeSearch()" style="padding:8px 14px;font-size:12px;border:none;border-radius:6px;background:var(--accent-blue);color:#fff;cursor:pointer;">搜索</button>
    </div>
    <div id="knowledgeSearchResults"></div>
    <div style="margin-top:12px;"><button onclick="refreshKnowledge()" style="padding:6px 12px;font-size:11px;border:1px solid var(--border);border-radius:4px;background:var(--bg-card);color:var(--text-primary);cursor:pointer;">← 返回目录</button></div>`;
  document.getElementById('knowledgeSearchInput').focus();
}

async function doKnowledgeSearch() {
  const query = document.getElementById('knowledgeSearchInput')?.value?.trim();
  if (!query) return;
  const results = document.getElementById('knowledgeSearchResults');
  if (!results) return;
  results.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:12px;">搜索中…</div>';
  try {
    const resp = await fetch(API_HOST + '/api/agent/knowledge/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    const data = await resp.json();
    if (!data || !data.length) {
      results.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:12px;">未找到匹配内容</div>';
      return;
    }
    results.innerHTML = data.map(r =>
      `<div style="padding:8px;margin-bottom:4px;background:var(--bg-surface);border-radius:4px;border-left:3px solid var(--accent-blue);font-size:11px;cursor:pointer;" onclick="readKnowledgePage('${escapeHtml(r.path.replace('.md',''))}')">
        <div style="color:var(--accent-blue);font-weight:600;">${escapeHtml(r.title)}</div>
        <div style="color:var(--text-secondary);margin-top:4px;">${escapeHtml(r.snippet || '')}</div>
        <div style="color:var(--text-muted);margin-top:2px;font-size:10px;">${escapeHtml(r.path)}</div>
      </div>`
    ).join('');
  } catch (e) { results.innerHTML = `<div style="color:var(--accent-red);font-size:11px;padding:12px;">搜索失败: ${escapeHtml(e.message)}</div>`; }
}

async function showKnowledgeGraph() {
  const body = document.getElementById('agentPanelBody');
  if (!body) return;
  body.innerHTML =
    `<h3 style="font-size:14px;color:var(--accent-purple);margin:0 0 12px;">🕸️ 知识图谱</h3>
    <div id="knowledgeGraphCanvas" style="width:100%;height:400px;background:var(--bg-deep);border-radius:6px;border:1px solid var(--border);overflow:hidden;position:relative;">
      <div style="text-align:center;color:var(--text-muted);padding:40px 20px;font-size:12px;">加载中…</div>
    </div>
    <div style="margin-top:10px;display:flex;gap:6px;">
      <button onclick="refreshKnowledge()" style="flex:1;padding:6px;font-size:11px;border:1px solid var(--border);border-radius:4px;background:var(--bg-card);color:var(--text-primary);cursor:pointer;">← 返回目录</button>
    </div>`;
  try {
    const resp = await fetch(API_HOST + '/api/agent/knowledge/graph');
    const g = await resp.json();
    renderKnowledgeGraph(g.nodes || [], g.links || []);
  } catch (e) {
    const canvas = document.getElementById('knowledgeGraphCanvas');
    if (canvas) canvas.innerHTML = `<div style="color:var(--accent-red);font-size:11px;padding:30px;text-align:center;">图谱加载失败: ${escapeHtml(e.message)}</div>`;
  }
}

function renderKnowledgeGraph(nodes, links) {
  const container = document.getElementById('knowledgeGraphCanvas');
  if (!container) return;
  if (!nodes.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:12px;">暂无知识图谱。在知识页中用 [[链接]] 建立交叉引用后会显示。</div>';
    return;
  }
  // 简单的 SVG 力导向布局（无外部依赖）
  const w = container.clientWidth || 540;
  const h = container.clientHeight || 400;
  const cx = w / 2, cy = h / 2;
  const radius = Math.min(w, h) * 0.35;

  // 如果节点不多，画圆环布局；否则随机散点
  let positions = [];
  if (nodes.length <= 20) {
    nodes.forEach((n, i) => {
      const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2;
      positions.push({ x: cx + radius * 0.8 * Math.cos(angle), y: cy + radius * 0.8 * Math.sin(angle) });
    });
  } else {
    nodes.forEach(() => { positions.push({ x: cx + (Math.random() - 0.5) * w * 0.6, y: cy + (Math.random() - 0.5) * h * 0.6 }); });
  }

  // 生成颜色
  const colors = ['#4d8cfc','#a277ff','#44eebb','#ff6b9d','#ff9e64','#f5a623'];
  const catColors = {};
  let ci = 0;
  nodes.forEach(n => { if (!catColors[n.category]) catColors[n.category] = colors[ci++ % colors.length]; });

  let svg = `<svg width="${w}" height="${h}" style="width:100%;height:100%;"><g>`;
  // 连线
  links.forEach(l => {
    const si = nodes.findIndex(n => n.id === l.source);
    const ti = nodes.findIndex(n => n.id === l.target);
    if (si >= 0 && ti >= 0) {
      svg += `<line x1="${positions[si].x}" y1="${positions[si].y}" x2="${positions[ti].x}" y2="${positions[ti].y}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
    }
  });
  // 节点
  nodes.forEach((n, i) => {
    const p = positions[i];
    const color = catColors[n.category] || '#888';
    const label = n.label.length > 12 ? n.label.slice(0,10) + '…' : n.label;
    svg += `<circle cx="${p.x}" cy="${p.y}" r="6" fill="${color}" opacity="0.8" stroke="#fff" stroke-width="1"/>`;
    svg += `<text x="${p.x}" y="${p.y + 16}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.6)">${escapeXml(label)}</text>`;
  });
  svg += '</g></svg>';
  container.innerHTML = svg;
}

function escapeXml(text) {
  if (!text) return '';
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatSize(bytes) {
  if (!bytes) return '0B';
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / 1048576).toFixed(1) + 'MB';
}

// ========== 技能 ==========

async function refreshSkills() {
  const body = document.getElementById('agentPanelBody');
  if (!body) return;
  try {
    const resp = await fetch(API_HOST + '/api/agent/skills');
    const skills = await resp.json();
    const statsResp = await fetch(API_HOST + '/api/agent/skills/stats');
    const stats = await statsResp.json();
    body.innerHTML =
      `<div id="skillsStats" style="padding:10px;background:var(--bg-surface);border-radius:6px;font-size:12px;line-height:1.9;">
        <div>总计: <strong>${stats.total ?? 0}</strong>（内置 ${stats.builtin ?? 0} / 自定义 ${stats.custom ?? 0}）</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">SKILL.md 可执行技能: <strong style="color:var(--accent-green);">${stats.markdown ?? 0}</strong> | 旧格式提示词技能: <strong>${stats.legacy ?? 0}</strong></div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
          <button onclick="document.getElementById('skillFileInput').click()" style="padding:4px 10px;font-size:11px;border:1px solid var(--border);border-radius:4px;background:var(--bg-card);color:var(--text-primary);cursor:pointer;">📂 从文件导入</button>
          <input type="file" id="skillFileInput" accept=".json,.md" style="display:none" multiple onchange="importSkillFiles(this)">
          <button onclick="showCreateSkillMdForm()" style="padding:4px 10px;font-size:11px;border:1px solid var(--accent-purple);border-radius:4px;background:var(--bg-card);color:var(--accent-purple);cursor:pointer;">✨ 新建 SKILL.md</button>
        </div>
      </div>
      <div id="skillsList" style="margin-top:14px;"></div>`;
    document.getElementById('skillsList').innerHTML =
      (skills || []).map(s => {
        const isMd = s.source === 'markdown' || s.source === 'custom' && s.base_dir;
        const badge = isMd
          ? `<span style="background:rgba(68,238,187,0.15);color:var(--accent-green);padding:1px 6px;border-radius:3px;font-size:9px;">${s.has_scripts ? '⚡ 可执行' : '📄 MD'}</span>`
          : `<span style="background:rgba(162,119,255,0.15);color:var(--accent-purple);padding:1px 6px;border-radius:3px;font-size:9px;">提示词</span>`;
        return `<div style="padding:8px;margin-bottom:4px;background:var(--bg-surface);border-radius:6px;border:1px solid var(--border);">
          <div style="font-size:12px;font-weight:600;color:var(--text-primary);display:flex;align-items:center;gap:6px;">${escapeHtml(s.name || '')} ${badge}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${escapeHtml(s.description || '')}</div>
          <div style="font-size:10px;color:var(--accent-purple);margin-top:4px;">${escapeHtml(s.category || '')}</div>
        </div>`;
      }).join('') || '<div style="font-size:11px;color:var(--text-muted);padding:8px;">暂无技能</div>';
    const el = document.getElementById('skillsCount');
    if (el) el.textContent = stats.total ?? 0;
  } catch (e) {
    body.innerHTML = `<div style="color:var(--accent-red);font-size:12px;padding:20px;">加载失败: ${escapeHtml(e.message)}</div>`;
    console.error(e);
  }
}

function showCreateSkillMdForm() {
  const body = document.getElementById('agentPanelBody');
  if (!body) return;
  body.innerHTML =
    `<h3 style="font-size:14px;color:var(--accent-purple);margin:0 0 12px;">✨ 新建 SKILL.md 技能</h3>
    <div style="display:grid;gap:10px;">
      <div><div class="label" style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">技能名（hyphen-case，如 my-skill）</div><input id="newSkillName" class="modal-input" placeholder="my-skill" style="width:100%;"></div>
      <div><div class="label" style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">描述（主要触发机制，说明做什么 + 何时使用）</div><input id="newSkillDesc" class="modal-input" placeholder="做什么。何时使用：(1) ... (2) ..." style="width:100%;"></div>
      <div><div class="label" style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">正文（Markdown 指令，模型触发后会读取）</div><textarea id="newSkillBody" class="modal-input" rows="10" placeholder="# My Skill\n\n详细使用说明..." style="width:100%;font-family:monospace;font-size:11px;"></textarea></div>
      <div style="font-size:10px;color:var(--text-muted);">提示：完整技能创建流程见 skill-creator 技能。也可直接在对话中让 Agent 用 skill-creator 帮你创建。</div>
      <div style="display:flex;gap:8px;">
        <button onclick="createSkillMdSubmit()" style="flex:1;padding:8px;font-size:12px;border:none;border-radius:6px;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple));color:#fff;cursor:pointer;">💾 创建</button>
        <button onclick="refreshSkills()" style="padding:8px 14px;font-size:12px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text-primary);cursor:pointer;">返回</button>
      </div>
    </div>`;
}

async function createSkillMdSubmit() {
  const name = document.getElementById('newSkillName').value.trim();
  const desc = document.getElementById('newSkillDesc').value.trim();
  const bodyText = document.getElementById('newSkillBody').value.trim();
  if (!name || !desc || !bodyText) { showToast('名称、描述、正文都不能为空', 'error'); return; }
  try {
    const resp = await fetch(API_HOST + '/api/agent/skills/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: desc, body: bodyText, category: 'custom' })
    });
    const d = await resp.json();
    if (d.ok) { showToast('✅ SKILL.md 技能已创建', 'success'); refreshSkills(); }
    else showToast('创建失败: ' + (d.error || ''), 'error');
  } catch (e) { showToast('创建失败: ' + e.message, 'error'); }
}

function importSkillFiles(input) {
  if (!input.files || !input.files.length) return;
  Array.from(input.files).forEach(file => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const text = e.target.result;
      // .md 文件 → SKILL.md 格式
      if (file.name.toLowerCase().endsWith('.md')) {
        // 尝试从 frontmatter 提取 name/description
        let name = file.name.replace(/\.md$/i, '');
        let desc = name;
        const fmMatch = text.match(/^---\n([\s\S]*?)\n---/);
        if (fmMatch) {
          const fm = fmMatch[1];
          const nm = fm.match(/name:\s*(.+)/);
          const dm = fm.match(/description:\s*(.+)/);
          if (nm) name = nm[1].trim().stripQuotes ? nm[1].trim() : nm[1].trim();
          if (dm) desc = dm[1].trim();
        }
        fetch(API_HOST + '/api/agent/skills/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description: desc, body: text, category: 'custom' })
        }).then(r => r.json()).then(d => {
          if (d.ok) { showToast('SKILL.md 导入成功: ' + name, 'success'); refreshSkills(); }
          else showToast('导入失败: ' + (d.error || ''), 'error');
        });
        return;
      }
      // .json 文件 → 旧格式
      try {
        const skill = JSON.parse(text);
        if (!skill.name || !skill.prompt) {
          showToast('无效的技能文件: ' + file.name + '（需要 name 和 prompt 字段）', 'error');
          return;
        }
        fetch(API_HOST + '/api/agent/skills/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: skill.name, description: skill.description || '',
            prompt: skill.prompt, category: skill.category || 'custom'
          })
        }).then(r => r.json()).then(d => {
          if (d.ok) { showToast('技能导入成功: ' + skill.name, 'success'); refreshSkills(); }
          else showToast('导入失败: ' + (d.error || ''), 'error');
        });
      } catch (err) { showToast('JSON 解析失败: ' + file.name, 'error'); }
    };
    reader.readAsText(file);
  });
  input.value = '';
}

// ========== 进化 ==========

async function refreshEvolution() {
  const body = document.getElementById('agentPanelBody');
  if (!body) return;
  try {
    const resp = await fetch(API_HOST + '/api/agent/evolution');
    const stats = await resp.json();
    const running = stats.is_running;
    const llmOn = stats.llm_enabled;
    const llmHint = llmOn
      ? `<span style="color:var(--accent-green);font-size:10px;">● LLM 已启用</span>`
      : `<span style="color:var(--accent-orange);font-size:10px;">● LLM 未启用（需配置 API Key）</span>`;

    // 异步加载梦境日记（不阻塞主面板）
    let diariesHtml = '<div style="font-size:11px;color:var(--text-muted);padding:8px;">加载中…</div>';
    try {
      const dResp = await fetch(API_HOST + '/api/agent/dream/diaries');
      const diaries = await dResp.json();
      diariesHtml = (diaries && diaries.length)
        ? diaries.map(d => `<div style="padding:8px;margin-bottom:4px;background:var(--bg-surface);border-radius:4px;border-left:3px solid var(--accent-purple);font-size:11px;">
            <div style="color:var(--accent-purple);font-weight:600;">🌙 ${escapeHtml(d.date)}</div>
            <div style="color:var(--text-secondary);margin-top:4px;white-space:pre-wrap;">${escapeHtml((d.content || '').slice(0, 300))}${(d.content||'').length > 300 ? '…' : ''}</div>
          </div>`).join('')
        : '<div style="font-size:11px;color:var(--text-muted);padding:8px;">暂无梦境日记（触发 Deep Dream 蒸馏后会生成）</div>';
    } catch (e) { diariesHtml = '<div style="font-size:11px;color:var(--text-muted);padding:8px;">梦境日记加载失败</div>'; }

    body.innerHTML =
      `<div style="padding:10px;background:var(--bg-surface);border-radius:6px;font-size:12px;line-height:1.9;">
        <div>累计进化次数: <strong>${stats.total_evolutions ?? 0}</strong></div>
        <div>最近一次: <strong>${stats.last_evolution ? new Date(stats.last_evolution).toLocaleString('zh-CN') : '从未执行'}</strong></div>
        <div>当前状态: <strong style="color:${running ? 'var(--accent-green)' : 'var(--text-muted)'};">${running ? '🔄 运行中' : '空闲'}</strong> ${llmHint}</div>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button onclick="triggerEvolutionManual()" style="flex:1;padding:8px;font-size:12px;border:none;border-radius:6px;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple));color:#fff;cursor:pointer;">⚡ 手动触发进化</button>
        <button onclick="triggerDreamManual()" style="flex:1;padding:8px;font-size:12px;border:none;border-radius:6px;background:linear-gradient(135deg,var(--accent-purple),#ff6b9d);color:#fff;cursor:pointer;">🌙 Deep Dream 蒸馏</button>
      </div>
      <button onclick="triggerDreamSummarize()" style="margin-top:6px;width:100%;padding:6px;font-size:11px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text-secondary);cursor:pointer;">📝 把当前对话归纳成 daily 记录</button>
      <div style="margin-top:12px;font-size:11px;color:var(--text-muted);line-height:1.6;">
        <strong>进化</strong>：用 LLM 回顾对话，提取用户偏好/经验教训写入长期记忆。默认空闲时自动触发，也可手动。
        <br><strong>Deep Dream</strong>：把近期 daily 记忆 LLM 蒸馏成精炼的长期记忆，避免记忆越堆越乱。建议每天用一次。
      </div>
      <div style="margin-top:16px;font-size:11px;color:var(--text-muted);">🌙 梦境日记：</div>
      <div style="margin-top:6px;max-height:240px;overflow-y:auto;">${diariesHtml}</div>`;
  } catch (e) {
    body.innerHTML = `<div style="color:var(--accent-red);font-size:12px;padding:20px;">加载失败: ${escapeHtml(e.message)}</div>`;
    console.error(e);
  }
}

async function triggerDreamManual() {
  try {
    if (!confirm('将用 LLM 蒸馏近期 daily 记忆为长期记忆，可能需要数十秒。继续？')) return;
    showToast('🌙 Deep Dream 蒸馏中…', 'info');
    const resp = await fetch(API_HOST + '/api/agent/dream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lookback_days: 1, force: true })
    });
    const d = await resp.json();
    if (d.ok) showToast(`✅ ${d.message}（偏好 ${d.preferences}，经验 ${d.lessons}）`, 'success');
    else showToast('蒸馏：' + (d.message || '失败'), 'info');
    setTimeout(refreshEvolution, 600);
  } catch (e) { showToast('蒸馏失败: ' + e.message, 'error'); }
}

async function triggerDreamSummarize() {
  try {
    showToast('📝 正在归纳对话…', 'info');
    const resp = await fetch(API_HOST + '/api/agent/dream/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [] })
    });
    const d = await resp.json();
    showToast(d.ok ? '✅ ' + d.message : '归纳：' + d.message, d.ok ? 'success' : 'info');
  } catch (e) { showToast('归纳失败: ' + e.message, 'error'); }
}

async function triggerEvolutionManual() {
  try {
    showToast('正在触发进化…', 'info');
    const resp = await fetch(API_HOST + '/api/agent/evolution/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [] })
    });
    const d = await resp.json();
    if (d.ok) showToast('进化已启动', 'success');
    else showToast('触发失败: ' + (d.error || ''), 'error');
    setTimeout(refreshEvolution, 800);
  } catch (e) { showToast('触发失败: ' + e.message, 'error'); }
}

// ========== 左侧栏技能选择列表 ==========

// 技能开关状态（持久化 localStorage）
const SKILL_TOGGLE_KEY = 'aura_skills_toggled';

function getToggledSkills() {
  try { return JSON.parse(localStorage.getItem(SKILL_TOGGLE_KEY) || '{}'); } catch(e) { return {}; }
}

function saveToggledSkills(data) {
  localStorage.setItem(SKILL_TOGGLE_KEY, JSON.stringify(data));
}

function setSkillEnabled(name, enabled) {
  const data = getToggledSkills();
  data[name] = enabled;
  saveToggledSkills(data);
}

function isSkillVisible(name) {
  const data = getToggledSkills();
  // 默认显示（未被设置过的显示）
  return data[name] !== false;
}

/** 获取启用的技能名列表（发给后端做技能过滤） */
function getEnabledSkillsList() {
  const data = getToggledSkills();
  return Object.keys(data).filter(k => data[k] !== false);
}

function toggleSkillsList() {
  const list = document.getElementById('skillsToggleList');
  const arrow = document.getElementById('skillsToggleArrow');
  if (!list) return;
  const isHidden = list.style.display === 'none';
  list.style.display = isHidden ? 'block' : 'none';
  if (arrow) arrow.textContent = isHidden ? '▲' : '▼';
  if (isHidden) refreshSkillsSidebar();
}

async function refreshSkillsSidebar() {
  const list = document.getElementById('skillsToggleList');
  if (!list) return;
  try {
    const resp = await fetch(API_HOST + '/api/agent/skills');
    const skills = await resp.json();
    if (!skills || !skills.length) {
      list.innerHTML = '<div style="text-align:center;font-size:10px;color:var(--text-muted);padding:8px;">暂无技能</div>';
      return;
    }
    const toggled = getToggledSkills();
    list.innerHTML = skills.map(s => {
      const enabled = toggled[s.name] !== false; // 默认启用
      return `<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;font-size:10px;color:var(--text-secondary);border-radius:4px;">
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;flex:1;min-width:0;" title="${escapeHtml(s.description || '')}">
          <input type="checkbox" ${enabled ? 'checked' : ''} onchange="setSkillEnabled('${escapeHtml(s.name)}', this.checked);" style="accent-color:var(--accent-blue);margin:0;">
          <span style="${enabled ? '' : 'opacity:0.4;'}overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(s.name)}</span>
          ${s.source === 'markdown' ? '<span style="background:rgba(68,238,187,0.2);color:var(--accent-green);padding:0 4px;border-radius:2px;font-size:8px;">MD</span>' : ''}
        </label>
      </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = '<div style="text-align:center;font-size:10px;color:var(--accent-red);padding:8px;">加载失败</div>';
  }
}

// 页面加载后也刷新一次技能列表到左侧栏
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(refreshSkillsSidebar, 2000);
});
