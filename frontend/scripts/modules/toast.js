function showToast(msg, type) {
 const existing = document.querySelector('.toast');
 if (existing) existing.remove();
 const toast = document.createElement('div');
 toast.className = `toast ${type}`;
 toast.textContent = msg;
 document.body.appendChild(toast);
 setTimeout(() => toast.remove(), 3000);
}