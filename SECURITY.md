# 安全策略

## 报告漏洞

如果你发现 AURA Studio 存在安全漏洞，请**不要**直接开启公开 Issue，而是通过以下方式私下报告：

- 使用 GitHub 的 **Security Advisory** 功能：仓库 → Security → Report a vulnerability
- 或发送邮件至 `jc@aura-studio.dev`，标题以 `[SECURITY] AURA Studio` 开头

请尽可能包含：

- 漏洞的清晰描述与影响范围
- 复现步骤（最小可复现示例最佳）
- 受影响的版本
- 建议的修复方向（可选）

## 响应承诺

- 收到报告后会在 **72 小时内**确认收到。
- 评估后会尽快给出修复计划与时间表，并在修复发布后致谢报告者（除非你希望匿名）。

## 安全使用建议

- 所有 API 密钥（Agnes AI、又拍云等）均为用户自有，请妥善保管，**切勿提交到任何公开仓库**。
- `backend/config.json`、`user_config.json`、`.env` 已被 `.gitignore` 忽略，提交前请确认未误纳入真实凭据。
- 本项目依赖第三方 AI 服务与对象存储，使用前请阅读相应服务条款与计费策略。
