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
   // 优先使用FORM API直传又拍云（不消耗服务器带宽）
   const policyResp = await fetch(`http://127.0.0.1:18922/api/upyun/policy?filename=${encodeURIComponent(file.name)}`);
   const policyData = await policyResp.json();
   
   if (policyData.error) {
    // 又拍云未配置，回退到S3 API或服务端上传
    throw new Error(policyData.error);
   }
   
   // 使用FORM API直传
   const fd = new FormData();
   fd.append('policy', policyData.policy);
   fd.append('signature', policyData.signature);
   fd.append('file', file);
   
   const uploadResp = await fetch(`http://v0.api.upyun.com/${policyData.bucket}`, {
    method: 'POST',
    body: fd
   });
   
   if (!uploadResp.ok) {
    const errText = await uploadResp.text();
    throw new Error(`又拍云上传失败: ${errText}`);
   }
   
   // 上传成功，使用CDN链接
   const cdnUrl = policyData.cdn_url;
   uploadedImages[group].push({ name: file.name, url: cdnUrl });
   showToast(`上传成功: ${file.name}`, 'success');
   // 自动将上传后的 CDN 链接填入关联的 URL 输入框
   const urlInputMap = {
    'vidI2v': 'vidI2vUrl',
    'imgI2i': 'imgMultiUrls',
    'imgI2iMulti': 'imgMultiUrls'
   };
   const inputId = urlInputMap[group];
   if (inputId) {
    const inputEl = document.getElementById(inputId);
    if (inputEl) inputEl.value = cdnUrl;
   }
  } catch (e) {
   // FORM API失败，回退到S3 API（服务端上传）
   try {
    showToast(`正在通过服务器上传 ${file.name}...`, 'info');
    const fd2 = new FormData();
    fd2.append('file', file);
    const resp = await fetch('http://127.0.0.1:18922/api/upload', {
     method: 'POST',
     body: fd2,
    });
    const data = await resp.json();
    if (data.url) {
     uploadedImages[group].push({ name: file.name, url: data.url });
     showToast(`上传成功: ${file.name}`, 'success');
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
   } catch (e2) {
    showToast(`上传异常: ${e2.message}`, 'error');
   }
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