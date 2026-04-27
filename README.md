# 🚀 Telegram Channel Board (AI Template)

这是一个基于 Cloudflare Workers 的开源 Telegram 频道看板模板。它可以将你的频道消息自动同步到一个美观、支持暗黑模式的网页上。

## ✨ 特性
- ⚡ **极速加载**：基于 Cloudflare Workers 全球加速。
- 📱 **移动优先**：完全适配手机浏览器，支持 PWA 体验。
- 🌙 **暗黑模式**：根据系统设置自动切换颜色。
- 🖼️ **图片缓存**：自动代理并缓存频道图片，解决加载问题。
- 🔒 **安全保护**：管理接口受密钥保护，防止恶意刷量。
- 🙈 **智能交互**：顶部横幅支持滚动自动隐藏和一键关闭（本地持久化记忆）。

## 🛠️ 快速开始

### 1. 准备工作
- 一个 Telegram 机器人 (通过 [@BotFather](https://t.me/BotFather) 获取 Token)。
- 将机器人设置为你频道的管理员。
- 一个 Cloudflare 账号。

### 2. 配置 KV 存储
在 Cloudflare Workers 控制台：
1. 转到 **存储和数据库** -> **KV** -> **创建命名空间**，名称建议设为 `TG_DATA`。
2. 在你的 Worker 设置中，将该 KV 绑定，变量名必须设为 `TG_DATA`。

### 3. 设置环境变量
在 Worker 的 **设置** -> **变量** 中添加以下内容：
- `BOT_TOKEN`: 你的机器人 Token。
- `CHANNEL_ID`: 你的频道 ID (例如 `-100123456789`)。
- `ADMIN_KEY`: 你自定义的管理密钥。
- `SITE_TITLE`: 网页的标题 (例如 `我的资源频道`)。
- `CONTACT_INFO`: 横幅显示的联系方式 (例如 `微信：xxx | 官网：xxx`)。

### 4. 激活同步
部署代码后，访问以下链接（替换为你自己的域名和密钥）：
`https://你的域名.workers.dev/?setup_webhook=1&key=你的密钥`

如果返回 `{"ok": true...}`，则表示配置成功！现在你在频道发消息，网页就会自动更新了。

## 📜 开源协议
MIT License. 欢迎 Star 和 Fork！
