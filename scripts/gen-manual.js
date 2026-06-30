const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
        ShadingType, LevelFormat, PageBreak, PageNumber, ExternalHyperlink,
        Bookmark, InternalHyperlink } = require('docx');

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };
const contentWidth = 9360;

function heading1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
}
function heading2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
}
function heading3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] });
}
function para(text) {
  return new Paragraph({ spacing: { after: 120 }, children: [new TextRun(text)] });
}
function boldPara(label, text) {
  return new Paragraph({ spacing: { after: 100 }, children: [
    new TextRun({ text: label, bold: true }), new TextRun(text)
  ]});
}
function tip(text) {
  return new Paragraph({ spacing: { after: 120 }, children: [
    new TextRun({ text: "💡 " + text, italics: true, color: "555555" })
  ]});
}
function warn(text) {
  return new Paragraph({ spacing: { after: 120 }, children: [
    new TextRun({ text: "⚠️ " + text, bold: true, color: "CC6600" })
  ]});
}

function step(num, text) {
  return new Paragraph({ spacing: { after: 80 }, children: [
    new TextRun({ text: num + ". ", bold: true, color: "2E75B6" }), new TextRun(text)
  ]});
}

function dataTable(headers, rows) {
  const colW = Math.floor(contentWidth / headers.length);
  const colWidths = headers.map(() => colW);
  return new Table({
    width: { size: contentWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({
        children: headers.map(h => new TableCell({
          borders, width: { size: colW, type: WidthType.DXA },
          shading: { fill: "2E75B6", type: ShadingType.CLEAR },
          margins: cellMargins,
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF", font: "Arial" })] })]
        }))
      }),
      ...rows.map(row => new TableRow({
        children: row.map(cell => new TableCell({
          borders, width: { size: colW, type: WidthType.DXA },
          margins: cellMargins,
          children: [new Paragraph({ children: [new TextRun({ text: cell, font: "Arial", size: 20 })] })]
        }))
      }))
    ]
  });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Microsoft YaHei", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Microsoft YaHei", color: "1A1A2E" },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, font: "Microsoft YaHei", color: "2E75B6" },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Microsoft YaHei", color: "333333" },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ]
  },
  sections: [
    // ========== 封面 ==========
    {
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
      },
      children: [
        new Paragraph({ spacing: { before: 3600 } }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "AURA Studio", size: 60, bold: true, color: "2E75B6", font: "Arial" })] }),
        new Paragraph({ spacing: { after: 100 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "v2.0.0", size: 36, color: "555555", font: "Arial" })] }),
        new Paragraph({ spacing: { before: 400, after: 400 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "AI 多模态创作工作台", size: 32, color: "1A1A2E" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "文本 · 图像 · 视频 · 无限画布", size: 26, color: "888888" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "基于 Agnes AI 官方 API 构建", size: 22, color: "AAAAAA" })] }),
        new Paragraph({ spacing: { before: 2000 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "2026 年 6 月", size: 22, color: "888888" })] }),
        new Paragraph({ children: [new PageBreak()] }),
      ]
    },

    // ========== 正文 ==========
    {
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
      },
      headers: {
        default: new Header({ children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD", space: 4 } },
          children: [new TextRun({ text: "AURA Studio v2.0.0 — 用户手册", size: 18, color: "999999", font: "Arial" })]
        })] })
      },
      footers: {
        default: new Footer({ children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "— ", size: 18, color: "999999" }), new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "999999" }), new TextRun({ text: " —", size: 18, color: "999999" })]
        })] })
      },
      children: [

        heading1("1. 欢迎使用 AURA Studio"),
        para("AURA Studio 是一款基于 Agnes AI 的桌面端多模态 AI 创作工作台。它集成了文本对话、图像生成、视频生成和无限画布四大核心能力，通过直观的面板切换设计，让你在同一界面内高效完成从创意到成品的完整工作流。"),
        para("本软件为桌面端应用（Windows 11+），内置离线激活机制保护软件分发。你需要一个有效的激活码和一个 Agnes AI 平台的 API Key 即可开始使用。"),

        heading1("2. 快速上手"),
        heading2("2.1 安装与激活"),
        step("1", "运行安装包 AURA-Studio-2.0.0-Setup.exe，按照提示完成安装。"),
        step("2", "启动 AURA Studio，启动屏动画播放后会自动弹出激活码输入界面。"),
        step("3", "在激活码输入框中粘贴激活码，点击「激活」按钮。系统会自动验证并绑定本机。"),
        step("4", "激活成功后进入欢迎引导界面。"),
        tip("激活码由开发者提供。一台机器只需激活一次，换机器需重新申请。"),

        heading2("2.2 获取 API Key"),
        para("AURA Studio 依赖 Agnes AI 平台提供 AI 能力，你需要先注册并获取 API Key："),
        step("1", "在欢迎引导界面点击「📝 免费注册获取 API Key」按钮，打开 Agnes AI 注册页面。"),
        step("2", "注册账户后，在平台控制台创建 API Key，复制密钥字符串。"),
        step("3", "将 API Key 粘贴到欢迎引导的输入框中，点击「🚀 开始使用」。"),
        step("4", "你也可以随时通过顶部栏的「🔑 API Key」区域管理密钥。"),
        tip("新注册用户通常有免费额度，可直接开始测试使用。"),

        heading2("2.3 配置对象存储（推荐）"),
        para("图生视频功能需要将图片以 URL 方式提交给 API，因此建议配置对象存储服务。推荐使用又拍云（新用户免费额度）。"),
        step("1", "点击顶部右侧「⚙️ 设置」按钮。"),
        step("2", "选择「对象存储」标签页，填写 Access Key、Secret Key、Bucket 名称、加速域名和接入端点。"),
        step("3", "点击「💾 保存全部设置」。"),
        tip("又拍云默认接入端点为 https://s3.api.upyun.com。后期 API 官方适配 Base64 后可能不再需要此配置。"),

        heading1("3. 界面概览"),
        para("AURA Studio 采用深色主题设计，主界面从上到下分为三个区域："),
        boldPara("顶部栏", "：Logo、API Key 管理、设置按钮和更新按钮。"),
        boldPara("Tab 导航栏", "：切换四大功能面板——图像创作、文本对话、视频创作、任务管理。"),
        boldPara("面板容器", "：各个功能面板的主体内容区域，采用覆盖切换方式显示。"),
        tip("点击 Tab 标签即可切换功能面板，切换时会自动保存当前面板的状态。"),

        heading1("4. 图像创作"),
        para("图像面板支持两种模式：文生图（Text-to-Image）和图生图（Image-to-Image）。面板采用左右分栏布局：左侧为表单区，右侧为实时结果展示栏。"),

        heading2("4.1 文生图（T2I）"),
        para("根据文字描述生成图像。"),
        step("1", "在 Prompt 输入框中描述你想要的图像。界面提供了山水风景、赛博朋克、角色设计三个模板供快速填入。"),
        step("2", "选择模型（推荐 Agnes Image 2.1 Flash），选择尺寸和响应格式。"),
        step("3", "（可选）取消勾选「自动翻译为英文」——如果你需要用中文描述语义但保留中文文本出现在画面中，取消此选项。"),
        step("4", "（可选）点击「✨ AI 优化提示词」让 AI 帮你润色 Prompt。"),
        step("5", "点击「🚀 生成图像」按钮，等待几秒到几十秒，结果将出现在右侧缩略图栏中。"),
        step("6", "点击任意缩略图可放大查看并复制图片 URL。"),

        heading2("4.2 图生图（I2I）"),
        para("基于参考图像进行风格迁移或内容变换。"),
        step("1", "点击「🔄 图生图」切换到 I2I 模式。"),
        step("2", "选择图像来源：URL 输入或本地上传（最多 4 张参考图）。"),
        step("3", "（可选）为每张参考图添加注释，说明其作用（角色/场景/道具/风格），这些注释会自动合成到 Prompt 中。"),
        step("4", "输入 Prompt，描述你对图像的变换要求。"),
        step("5", "选择模型和尺寸，点击「🔄 转换图像」。"),
        warn("切换到其他面板时，I2I 模式会自动重置为文生图模式，避免界面污染。"),

        heading2("4.3 结果与画廊"),
        boldPara("最新结果区", "：右侧栏顶部，显示最近 5 张生成图像，带 T2I/I2I 来源标签。"),
        boldPara("历史画廊区", "：右侧栏下方，显示全部生成记录（最多 20 张），支持缩略图浏览和点击放大。"),
        boldPara("复制URL", "：在弹窗大图模式下，可以直接复制图片的在线链接。"),

        heading1("5. 视频创作"),
        para("视频面板支持四种模式：文生视频、图生视频、多图视频和关键帧动画。所有模式共用一个设置区域，通过顶部的模式按钮切换。"),

        heading2("5.1 文生视频"),
        step("1", "在 Prompt 区域描述视频场景。推荐结构：[主体] + [动作] + [场景] + [镜头运动] + [光照] + [风格]。"),
        step("2", "设置宽度和高度，以及帧数和帧率。"),
        step("3", "（可选）点击 AI 优化提示词，或取消「自动翻译为英文」勾选框。"),
        step("4", "点击「生成视频」提交任务。"),

        heading2("5.2 图生视频"),
        para("基于一张参考图像生成视频。需要先配置对象存储（参见 2.3 节），因为当前 API 只支持 URL 方式提交图片。"),
        step("1", "上传参考图像或输入图片 URL。"),
        step("2", "输入 Prompt 描述期望的视频效果。"),
        step("3", "设置视频参数后点击生成。"),

        heading2("5.3 多图视频与关键帧动画"),
        para("这两种模式需要上传多张图像。点击「📁 多图上传」切换到上传模式，选择 2 张以上的图片后提交。系统会按 Prompt 描述在图像之间生成过渡动画。"),

        heading2("5.4 视频任务管理"),
        para("由于视频生成耗时较长（通常 1-5 分钟），所有视频任务采用异步机制：提交后进入任务队列，后台轮询状态。"),
        step("1", "提交视频任务后会自动进入任务管理面板。"),
        step("2", "每个任务显示唯一的 video_id（完整换行展示），以及状态：排队中 / 生成中 / 已完成 / 失败。"),
        step("3", "进度条实时更新，完成 100% 后出现「▶ 播放」按钮。"),
        step("4", "点击播放按钮会自动跳转视频面板展示结果，任务面板内也有独立视频预览区。"),
        step("5", "如未自动获取 URL，可点击「📥 获取」强制拉取，或点击「🔄」刷新单个任务。"),
        step("6", "「🗑️ 清除已完成」可一键清理已完成的记录。"),
        tip("视频任务的轮询间隔约 22 秒，请耐心等待。你可以切换到其他面板继续工作，不影响后台轮询。"),

        heading1("6. 无限画布"),
        para("无限画布是一个独立的可视化工作流编辑器，用于在统一界面内编排多步骤的 AI 创作流程。你可以将文本、图像、视频生成节点连接起来，形成一个可复用的创作流水线。"),
        boldPara("入口", "：点击主界面顶部 Image Panel 内的「🎨 无限画布」链接打开独立画布页面。"),

        heading2("6.1 项目管理"),
        step("1", "首次进入画布，会看到项目列表首页。输入项目名称，点击「创建项目」。"),
        step("2", "已有项目会以卡片形式展示，显示名称和最近修改时间。"),
        step("3", "点击项目卡片进入画布编辑模式，可随时返回首页切换项目。"),
        step("4", "支持重命名和删除项目。"),

        heading2("6.2 节点系统"),
        para("画布支持九种节点类型，通过双击画布或使用右键菜单添加："),
        dataTable(["节点", "图标", "说明"], [
          ["文本 (Text)", "📝", "输入文本 Prompt 或笔记"],
          ["图像 (Image)", "🖼️", "拖入参考图像"],
          ["文生图 (T2I)", "🎨", "根据上游文本生成图像"],
          ["图生图 (I2I)", "🔄", "基于上游图像进行风格变换"],
          ["文生视频 (T2V)", "🎬", "根据上游文本生成视频"],
          ["图生视频 (I2V)", "📹", "基于上游图像生成视频"],
          ["多图视频 (Multi)", "🎞️", "根据多张上游图像生成过渡视频"],
          ["关键帧 (KF)", "🎯", "基于关键帧图像生成动画"],
          ["预览 (Preview)", "👁️", "展示上游节点的生成结果"],
        ]),
        boldPara("连接", "：从一个节点的输出端口拖拽连线到目标节点的输入端口，即可建立数据流动关系。"),
        boldPara("操作", "：拖拽移动节点、拖动右下角调整大小、选中后 Delete 键删除。"),

        heading2("6.3 画布操作"),
        boldPara("平移", "：鼠标拖拽空白区域移动画布视角。"),
        boldPara("缩放", "：Ctrl + 滚轮缩放画布。"),
        boldPara("生成", "：选中可生成节点（T2I/I2I/T2V 等），点击节点上的播放按钮或右侧面板的生成按钮，系统会根据上游连接自动收集 Prompt 和参考图像并提交生成任务。"),
        boldPara("资产栏", "：右侧资产面板汇总所有节点生成的图像和视频结果，可按类型筛选和预览。"),
        tip("画布数据保存在浏览器 localStorage 中。清除浏览器数据会导致项目丢失，建议定期导出备份。"),

        heading1("7. 文本对话"),
        para("文本对话面板提供完整的 AI 聊天体验，支持流式输出、多会话管理、深度思考和高级参数调节。"),

        heading2("6.1 基本对话"),
        step("1", "在底部输入框中输入问题，按 Enter 发送（Shift+Enter 换行）。"),
        step("2", "AI 回答前会显示「正在思考…」动画，流式输出逐字呈现。"),
        step("3", "支持上传图片进行多模态对话（点击输入框左侧 🖼️ 按钮）。"),
        step("4", "对话框右侧的「📋」按钮可以复制 AI 的回答内容。"),

        heading2("6.2 会话管理"),
        para("左侧会话栏显示所有对话历史，每个会话自动以第一条消息的前几个字命名。"),
        step("1", "点击「＋」新建会话。"),
        step("2", "点击已有会话名称即可切换。"),
        step("3", "导出对话：右侧底部「📥 导出对话」按钮，可将当前会话保存为 JSON 文件。"),
        tip("所有对话自动保存在本地，刷新页面不会丢失。"),

        heading2("6.3 深度思考与高级参数"),
        boldPara("🧠 深度思考", "：开启后，AI 会在回答前进行分步骤推理分析，给出更清晰、更有条理的回答。"),
        boldPara("💬 系统提示词", "：自定义 AI 的角色设定，如「你是一个专业的 Python 编程助手」。"),
        boldPara("高级参数（折叠）", "：点击「高级参数」展开，可调节温度（0-2）、最大输出 Token 数（默认 2048）和 Top-P（0-1）。"),
        boldPara("🤖 模型选择", "：支持 Agnes 2.0 Flash（256K 上下文，推荐）和 Agnes 1.5 Flash（多模态识别）。"),
        boldPara("⚡ 流式输出", "：默认开启，逐个字符实时展示回答。关闭后等待完整回答再一次性显示。"),

        heading1("8. 设置"),
        para("点击顶部栏的「⚙️ 设置」打开设置面板，包含以下配置项："),
        boldPara("API Key", "：管理你的 Agnes AI API 密钥。"),
        boldPara("模型配置", "：设置默认使用的文本、图像和视频模型。"),
        boldPara("轮询设置", "：调整视频任务的状态查询间隔（默认 22 秒）。"),
        boldPara("对象存储", "：配置又拍云或其他 S3 兼容服务的 Access Key / Secret Key / Bucket / 域名 / 端点。"),
        boldPara("所有设置自动保存在本地，重启后仍然有效。", ""),

        heading1("9. 快捷键与技巧"),
        heading2("9.1 快捷键"),
        dataTable(["操作", "快捷键"], [
          ["发送消息（对话）", "Enter"],
          ["换行（对话）", "Shift + Enter"],
          ["复制 URL（结果区）", "点击 📋"],
        ]),

        heading2("9.2 Prompt 编写建议"),
        heading3("图像推荐结构"),
        para("[主体] + [场景/环境] + [风格] + [光照] + [构图] + [画质要求]"),
        heading3("视频推荐结构"),
        para("[主体] + [动作] + [场景] + [镜头运动] + [光照] + [风格]"),
        heading3("通用技巧"),
        para("使用英文 Prompt 通常效果更好，中文 Prompt 可开启「自动翻译为英文」。如果需要画面中包含中文文字，请取消自动翻译。"),

        heading1("10. 常见问题"),
        heading2("Q: 激活码提示无效？"),
        para("A: 激活码绑定机器码，换电脑或重装系统会导致机器码变化，需联系开发者重新申请。"),
        heading2("Q: 生成图像后看不到结果？"),
        para("A: 检查右侧的缩略图结果栏。点击任意缩略图可放大查看。图像结果区域采用 sticky 定位，始终在右上方可见。"),
        heading2("Q: 视频任务一直排队？"),
        para("A: 视频生成通常需要 1-5 分钟，请耐心等待。可在任务管理面板查看实时进度。如超过 10 分钟无变化，尝试点击任务右侧的刷新按钮。"),
        heading2("Q: 图生视频提示缺少图像？"),
        para("A: 需要先配置对象存储（参见 2.3 节），因为图生视频当前仅支持 URL 方式提交图片。"),
        heading2("Q: 对话刷新后内容变短？"),
        para("A: 此问题已在 v2.0.0 修复。如果仍有问题，请确保浏览器未处于隐私模式。"),
        heading2("Q: 多图视频提示至少需要 2 张图？"),
        para("A: 确认已点击「📁 多图上传」切换到上传模式后再选图。URL 输入模式下需要用英文逗号分隔多个图片链接。"),

        heading1("11. 更新与反馈"),
        para("软件启动后会自动检测是否有新版本。右上角「⬆ 更新」按钮在有新版本时可用，点击即可下载并安装更新。"),
        para("如有问题反馈或功能建议，请联系开发者。"),

        new Paragraph({ spacing: { before: 600 }, alignment: AlignmentType.CENTER, children: [
          new TextRun({ text: "— 全文完 —", size: 22, color: "AAAAAA", italics: true })
        ]}),
      ]
    }
  ]
});

Packer.toBuffer(doc).then(buffer => {
  const outPath = path.join(__dirname, '..', 'release', 'AURA-Studio-v2.0-用户手册-v2.docx');
  fs.writeFileSync(outPath, buffer);
  console.log("用户手册已生成: " + outPath);
  console.log("大小: " + (buffer.length / 1024).toFixed(1) + " KB");
});
