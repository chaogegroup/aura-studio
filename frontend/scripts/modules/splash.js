const SPLASH_TAGLINES = [
 "AI 多模态创作工作台",
 "文本 · 图像 · 视频 · 无限画布",
 "以想象为引擎，让 AI 为你而生",
 "AURA — 你的 AI 创作伙伴"
];

function animateSplash(progress, status) {
 const bar = document.getElementById('splashBar');
 const el = document.getElementById('splashStatus');
 if (bar) bar.style.width = progress + '%';
 if (el && status) el.textContent = status;
}
function hideSplash() {
 splashHideReady = true;
}
function tryHideSplash() {
 if (splashHideReady && splashTypewriterDone && splashHideTimer) {
  animateSplash(100, '就绪 ✓');
  setTimeout(function() {
   var el = document.getElementById('appLoading');
   if (el) { el.classList.add('hide'); setTimeout(function() {
    if (el.parentNode) el.parentNode.removeChild(el);
    var saved = localStorage.getItem('aura_welcome_done');
    if (!apiKey && !saved) {
     var wo = document.getElementById('welcomeOverlay');
     if (wo) wo.classList.add('show');
    }
   }, 800); }
  }, 400);
 }
}
function initSplash() {
 const container = document.getElementById('splashParticles');
 if (container) {
  for (let i = 0; i < 24; i++) {
   const dot = document.createElement('div');
   const size = 1.5 + Math.random() * 3;
   const x = Math.random() * 100;
   const y = Math.random() * 100;
   const dur = 3 + Math.random() * 5;
   const delay = Math.random() * 4;
   const colors = ['#4d8cfc', '#a277ff', '#44eebb', '#ff6b9d', '#ff9e64'];
   const color = colors[Math.floor(Math.random() * colors.length)];
   dot.style.cssText = `position:absolute;left:${x}%;top:${y}%;width:${size}px;height:${size}px;border-radius:50%;background:${color};opacity:${0.15 + Math.random() * 0.35};animation:splash-float ${dur}s ease-in-out ${delay}s infinite;`;
   container.appendChild(dot);
  }
 }
}

function startSplashSequence() {
 splashHideReady = true;
 if (!splashHideTimer) splashHideTimer = setTimeout(() => {}, 4500);

 var totalChars = SPLASH_TAGLINES.reduce(function(s, l) { return s + l.length; }, 0);
 var charsTyped = 0;

 var taglineIdx = 0;
 var charIdx = 0;
 var taglineEl = document.getElementById('splashTagline');
 if (taglineEl) {
  function typeNext() {
   var line = SPLASH_TAGLINES[taglineIdx];
   if (charIdx <= line.length) {
    taglineEl.textContent = line.slice(0, charIdx);
    charIdx++;
    charsTyped++;
    var progress = Math.min(85, Math.round((charsTyped / totalChars) * 85) + 5);
    animateSplash(progress, '');
    splashTaglineTimer = setTimeout(typeNext, 25 + Math.random() * 30);
   } else {
    if (taglineIdx === SPLASH_TAGLINES.length - 1) {
     animateSplash(100, '就绪 ✓');
     splashTypewriterDone = true;
     tryHideSplash();
    }
    splashTaglineTimer = setTimeout(function() {
     taglineEl.textContent = '';
     taglineIdx = (taglineIdx + 1) % SPLASH_TAGLINES.length;
     charIdx = 0;
     setTimeout(typeNext, 600);
    }, 1500);
   }
  }
  typeNext();
 } else {
  animateSplash(10, '准备就绪…');
  setTimeout(function() { animateSplash(40, '加载界面…'); }, 600);
  setTimeout(function() { animateSplash(70, '配置就绪'); }, 1500);
  setTimeout(function() { animateSplash(100, '就绪 ✓'); hideSplash(); }, 2500);
 }
}
