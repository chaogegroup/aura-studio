function formatMessageContent(text) {
 if (!text) return '';
 // Handle multimodal array content (text + image_url)
 if (Array.isArray(text)) {
  let result = '';
  for (const part of text) {
   if (part.type === 'text' && part.text) {
    result += formatMessageContentString(part.text);
   } else if (part.type === 'image_url' && part.image_url?.url) {
    const src = part.image_url.url;
    result += '<div style="margin:8px 0;"><img src="' + src + '" style="max-width:100%;max-height:300px;border-radius:8px;border:1px solid var(--border);" alt="chat image"></div>';
   }
  }
  return result;
 }
 return formatMessageContentString(text);
}

function formatMessageContentString(text) {
 if (!text) return '';
 // Escape HTML first
 let html = text
 .replace(/&/g, '&amp;')
 .replace(/</g, '&lt;')
 .replace(/>/g, '&gt;');
 // Markdown images: ![alt](url)
 html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<div style="margin:8px 0;"><img src="$2" alt="$1" style="max-width:100%;max-height:300px;border-radius:8px;border:1px solid var(--border);" loading="lazy"></div>');
 // Markdown links: [text](url)
 html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--accent-blue);text-decoration:underline;">$1</a>');
 // Code blocks: ```...``` (after links so code inside ``` is preserved)
 html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
 return `<pre><code class="language-${lang}">${code}</code></pre>`;
 });
 // Inline code: `...`
 html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
 // Bold: **...**
 html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
 // Italic: *...*
 html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
 // Auto-link plain image URLs - skip URLs already in HTML tags
 html = html.replace(/(?<!=")(https?:\/\/[^\s<>]+\.(?:jpg|jpeg|png|gif|webp|bmp|svg))/gi, '<div style="margin:8px 0;"><img src="$1" style="max-width:100%;max-height:300px;border-radius:8px;border:1px solid var(--border);" loading="lazy"></div>');
 // Auto-link plain URLs - skip URLs already in HTML attributes
 html = html.replace(/(?<!=")(https?:\/\/[^\s<>]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:var(--accent-blue);text-decoration:underline;">$1</a>');
 // Line breaks
 html = html.replace(/\n/g, '<br>');
 return html;
}

function escapeHtml(text) {
 if (!text) return '';
 return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}