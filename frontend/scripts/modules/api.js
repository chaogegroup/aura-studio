async function saveApiKey() {
  apiKey = document.getElementById("apiKeyInput").value.trim();
  localStorage.setItem("agnes_api_key", apiKey);
  try {
    await fetch(API_HOST + "/api/config/api-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey })
    });
  } catch (e) {}
  // Also update api_base if changed
  const apiBase = document.getElementById("setApiBase")?.value?.trim();
  if (apiBase) {
    try {
      await fetch(API_HOST + "/api/config/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_base: apiBase })
      });
    } catch (e) {}
  }
  if (window.showToast) showToast("API Key 已保存", "success");
}

function getHeaders() {
  if (!apiKey) throw new Error("请先输入 API Key");
  return { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" };
}

function getAuthHeaders() {
  if (!apiKey) throw new Error("请先输入 API Key");
  return { Authorization: "Bearer " + apiKey };
}
