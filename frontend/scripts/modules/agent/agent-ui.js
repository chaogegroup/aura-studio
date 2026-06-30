// ========== Agent UI Module ==========

(function() {
  window.AgentUI = {
  isEnabled: false,
  isRunning: false,
  currentSteps: [],

  toggle: function() {
  this.isEnabled = true; // 始终开启
  },

  renderStep: function(stepData) {
  const container = document.getElementById("agentSteps");
  if (!container) return;
  container.classList.add("visible");

  const stepEl = document.createElement("div");
  stepEl.className = "agent-step";

  if (stepData.type === "step_start") {
  stepEl.innerHTML = `<div class="agent-step-header">
   <span class="agent-step-num">步骤 ${stepData.step}</span>
   <span class="agent-step-status running">执行中...</span>
  </div>`;
  } else if (stepData.type === "tool_start") {
  stepEl.innerHTML = `<div class="agent-step-tool">
   <span class="agent-tool-icon">🔧</span>
   <span class="agent-tool-name">${this.escapeHtml(stepData.tool)}</span>
   <span class="agent-tool-args">${this.escapeHtml(JSON.stringify(stepData.args || {}))}</span>
  </div>`;
  } else if (stepData.type === "tool_end") {
  const result = stepData.result;
  let resultHtml = "";
  if (result && result.url) {
   resultHtml = `<div class="agent-tool-result"><img src="${result.url}" style="max-width:200px;max-height:150px;border-radius:8px;" /></div>`;
  } else if (result && result.task_id) {
   resultHtml = `<div class="agent-tool-result">视频任务已创建: ${result.task_id}</div>`;
  } else if (result && result.node_id) {
   resultHtml = `<div class="agent-tool-result">画布节点已创建: ${result.node_id}</div>`;
  }
  stepEl.innerHTML = `<div class="agent-step-tool done">
   <span class="agent-tool-icon">✅</span>
   <span class="agent-tool-name">${this.escapeHtml(stepData.tool)}</span>
  </div>${resultHtml}`;
  } else if (stepData.type === "tool_error") {
  stepEl.innerHTML = `<div class="agent-step-tool error">
   <span class="agent-tool-icon">❌</span>
   <span class="agent-tool-name">${this.escapeHtml(stepData.tool)}</span>
   <span class="agent-tool-error">${this.escapeHtml(stepData.error)}</span>
  </div>`;
  } else if (stepData.type === "complete") {
  stepEl.className = "agent-step complete";
  stepEl.innerHTML = `<div class="agent-step-header">
   <span class="agent-step-icon">✨</span>
   <span>任务完成</span>
  </div>`;
  } else if (stepData.type === "max_steps_reached") {
  stepEl.className = "agent-step warning";
  stepEl.innerHTML = `<div class="agent-step-header">
   <span class="agent-step-icon">⚠️</span>
   <span>达到最大执行步数</span>
  </div>`;
  }

  stepEl.classList.add("agent-step-enter");
  container.appendChild(stepEl);
  container.scrollTop = container.scrollHeight;
  setTimeout(() => stepEl.classList.remove("agent-step-enter"), 300);
  this.currentSteps.push(stepEl);
  },

  clearSteps: function() {
  this.currentSteps = [];
  const container = document.getElementById("agentSteps");
  if (container) { container.innerHTML = ""; container.classList.remove("visible"); }
  },

  setRunning: function(running) {
  this.isRunning = running;
  const sendBtn = document.getElementById("btnSend");
  if (sendBtn) sendBtn.disabled = running;
  const input = document.getElementById("chatInput");
  if (input) input.disabled = running;
  },

  escapeHtml: function(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
  }
  };
})();
