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