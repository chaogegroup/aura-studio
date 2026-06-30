---
name: knowledge-wiki
description: 个人知识库管理技能。适用于：(1) 将对话中产生的结构化知识整理为知识页，(2) 按规范格式写入 ./knowledge/<category>/ 并更新 index.md，(3) 读取引用知识页获取参考信息。
category: meta
---

# Knowledge Wiki

本技能指导如何维护知识库的页面格式、命名规范和索引同步。

## 知识库结构

```
~/.aura-studio/knowledge/
├── index.md              索引（必须同步更新）
├── entities/             人物/公司/项目
├── concepts/             技术概念/方法论
├── sources/              文章/链接/文档摘要
├── analysis/             深度讨论结论/方案
└── creation/             AURA 创作：角色/场景/道具/风格
```

## 页面格式

每篇知识页是一个独立的 .md 文件，格式如下：

```markdown
# Title

关键信息摘要，1-2 句。

## 详情

主体内容。涉及的术语可用 `[[其他页面]]` 建立交叉引用（wiki 风格），或 [文本](其他页面.md)（Markdown 链接格式）。

## 参考

- 来源链接或相关页面
```

## 命名规范

- 文件名用 hyphen-case（连字符分隔小写）：`my-article-title.md`
- 不超过 80 字符
- 同一分类下文件名唯一

## 索引维护

每次创建或更新知识页后，**必须同步更新** `./knowledge/index.md`，在对应分类下添加一行：

```markdown
- [页面标题](category/slug.md) - 一句话简介
```

如果新页面是首个属于某分类的页面，在 index.md 中添加分类标题：

```markdown
## 新分类名
```

## 交叉引用

在同一知识库内，用 `[[页面名]]` 或 `[文本](路径.md)` 引用其他页面。这会被图谱解析器自动识别，构建知识图谱。

例如 `entities/computer-vision.md` 中引用 `concepts/deep-learning.md`：
```markdown
计算机视觉的核心技术是 [[concepts/deep-learning]]。
```

或：
```markdown
计算机视觉的核心技术是 [深度学习](concepts/deep-learning.md)。
```

## 更新场景

当对话中涉及以下场景时，应创建或更新知识页（由系统提示词规则驱动，不须额外询问）：

1. 用户分享了有价值的文章/链接/文档 → `knowledge/sources/`
2. 深度讨论产生了明确的结论或方案 → `knowledge/analysis/`
3. 涉及重要人物、公司、项目 → `knowledge/entities/`
4. 讨论了技术概念或方法论 → `knowledge/concepts/`
5. 建立了角色/场景/道具/风格等创作设定 → `knowledge/creation/`
