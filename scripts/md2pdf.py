import markdown
import weasyprint
from weasyprint import HTML, CSS

# Read MD
with open('docs/又拍云配置指南.md', 'r', encoding='utf-8') as f:
    md_text = f.read()

# Convert MD to HTML
html_body = markdown.markdown(md_text, extensions=['tables', 'fenced_code', 'nl2br'])

# Full HTML with print-friendly CSS
html_full = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
@page { margin: 2cm 2.5cm; size: A4 }
body { font-family: "Noto Sans SC", "Microsoft YaHei", "SimHei", sans-serif; font-size: 13px; line-height: 1.9; color: #1a1a1a }
h1 { color: #4d8cfc; border-bottom: 2px solid #4d8cfc; padding-bottom: 8px; font-size: 22px; page-break-after: avoid }
h2 { color: #a277ff; margin-top: 28px; font-size: 17px; page-break-after: avoid }
h3 { color: #44eebb; font-size: 14px; margin-top: 14px }
p { margin: 6px 0 }
a { color: #4d8cfc; text-decoration: none }
code { background: #f0f0f0; padding: 1px 5px; border-radius: 3px; font-size: 12px; color: #c7254e }
pre { background: #1a1a2e; color: #e8e9ed; padding: 12px 16px; border-radius: 6px; font-size: 12px; overflow-x: auto; page-break-inside: avoid }
table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 12px }
th { background: #4d8cfc; color: white; padding: 7px 10px; text-align: left }
td { border: 1px solid #ddd; padding: 6px 10px }
tr:nth-child(even) td { background: #f9f9f9 }
blockquote { border-left: 3px solid #4d8cfc; margin: 8px 0; padding: 4px 14px; background: #f0f7ff; font-size: 12px }
</style>
</head>
<body>
''' + html_body + '''
</body>
</html>'''

with open('docs/又拍云配置指南-tmp.html', 'w', encoding='utf-8') as f:
    f.write(html_full)

print('HTML created, now generating PDF...')
HTML(filename='docs/又拍云配置指南-tmp.html').write_pdf('docs/又拍云配置指南.pdf')
print('PDF created: docs/又拍云配置指南.pdf')
