/**
 * Telegram Channel Board - AI Template for Cloudflare Workers
 * 功能：将 Telegram 频道内容自动同步至网页展示，支持图片缓存、暗黑模式、移动端优化
 * * 配置指南：
 * 1. 绑定 KV 命名空间，变量名为 TG_DATA
 * 2. 在环境变量中设置：
 * - BOT_TOKEN: 你的 TG 机器人 Token
 * - CHANNEL_ID: 你的频道 ID (例如 -100xxx)
 * - ADMIN_KEY: 自定义的管理密钥 (用于设置 Webhook 和清空数据)
 * - CONTACT_INFO: 网页横幅显示的联系方式
 * - SITE_TITLE: 网页标题
 */

let isWriting = false;

export default {
  async fetch(request, env, ctx) {
    const { BOT_TOKEN, CHANNEL_ID, TG_DATA, ADMIN_KEY, CONTACT_INFO, SITE_TITLE } = env;
    
    // 默认配置（如果环境变量未设置则使用默认值）
    const config = {
      title: SITE_TITLE || "频道看板模板",
      contact: CONTACT_INFO || "请在环境变量中设置联系方式",
      adminKey: ADMIN_KEY || "admin_password"
    };

    if (!TG_DATA) return new Response("❌ Missing KV binding: TG_DATA", { status: 500 });
    if (!BOT_TOKEN) return new Response("❌ Missing Environment Variable: BOT_TOKEN", { status: 500 });

    const url = new URL(request.url);
    const adminKeyInput = url.searchParams.get("key");

    // ==========================================
    // 🔐 安全校验逻辑 (管理功能)
    // ==========================================
    const isAdminTask = url.pathname === "/debug" || 
                        url.searchParams.has("clear") || 
                        url.searchParams.has("setup_webhook");

    if (isAdminTask && adminKeyInput !== config.adminKey) {
      return new Response("❌ Unauthorized", { status: 401 });
    }

    // --- 设置 Webhook ---
    if (url.searchParams.get("setup_webhook") === "1") {
      const webhookUrl = `https://${url.hostname}/telegram-webhook`;
      const tgApi = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${webhookUrl}`;
      const res = await fetch(tgApi);
      return new Response(await res.text(), { headers: { "Content-Type": "application/json" } });
    }

    // --- 调试信息 ---
    if (url.pathname === "/debug") {
      const history = await TG_DATA.get("msg_history");
      return new Response(JSON.stringify({ 
        CHANNEL_ID, 
        "Count": history ? JSON.parse(history).length : 0,
        "Domain": url.hostname
      }, null, 2), { headers: { "Content-Type": "application/json" }});
    }

    // --- 清空数据 ---
    if (url.searchParams.get("clear") === "1") {
      await TG_DATA.delete("msg_history");
      return new Response("✅ Data Cleared", { status: 200 });
    }

    // ==========================================
    // 1. Webhook 接收通道
    // ==========================================
    if (request.method === "POST" && url.pathname === "/telegram-webhook") {
      try {
        const update = await request.json();
        if (update.channel_post && update.channel_post.chat.id.toString() === CHANNEL_ID) {
          const post = update.channel_post;
          let file_id = null; let media_type = null;

          if (post.photo && post.photo.length > 0) { 
            file_id = post.photo[post.photo.length - 1].file_id; 
            media_type = 'photo'; 
          } 

          const newMsg = {
            id: post.message_id, 
            date: post.date,
            text: post.text || post.caption || "",
            media_type: media_type, 
            file_id: file_id
          };

          let waitTime = 0;
          while (isWriting && waitTime < 2000) {
            await new Promise(resolve => setTimeout(resolve, 50));
            waitTime += 50;
          }

          isWriting = true;
          try {
            let history = [];
            const raw = await TG_DATA.get("msg_history");
            try { if(raw) history = JSON.parse(raw); } catch(e){}
            history = [newMsg, ...history.filter(m => m.id !== newMsg.id)].slice(0, 50);
            await TG_DATA.put("msg_history", JSON.stringify(history));
          } finally {
            isWriting = false;
          }
        }
        return new Response("OK", { status: 200 });
      } catch (e) { 
        isWriting = false;
        return new Response("Error", { status: 500 }); 
      }
    }

    // ==========================================
    // 2. 图片中转代理
    // ==========================================
    if (url.pathname === "/api/media") {
      const fileId = url.searchParams.get("file_id");
      if (!fileId) return new Response("Missing file_id", { status: 400 });
      const cache = caches.default; 
      const cacheKey = new Request(url.toString(), request);
      let response = await cache.match(cacheKey);
      if (!response) {
        try {
          const fileData = await (await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`)).json();
          if (!fileData.ok) return new Response("Not Found", { status: 404 });
          const mediaRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`);
          response = new Response(mediaRes.body, { 
            headers: { 
              "Content-Type": mediaRes.headers.get("Content-Type"), 
              "Cache-Control": "public, max-age=31536000", 
              "Access-Control-Allow-Origin": "*" 
            } 
          });
          ctx.waitUntil(cache.put(cacheKey, response.clone()));
        } catch(e) { return new Response("Error", { status: 500 }); }
      }
      return response;
    }

    // ==========================================
    // 3. 数据 API
    // ==========================================
    if (url.pathname === "/api/messages") {
      const history = JSON.parse(await TG_DATA.get("msg_history") || "[]");
      const channelInfo = JSON.parse(await TG_DATA.get("channel_info") || `{"title": "${config.title}", "subscribers": 0}`);
      return new Response(JSON.stringify({ history, channelInfo }), { 
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
      });
    }

    // ==========================================
    // 4. 前端网页 UI
    // ==========================================
    const html = `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>${config.title}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/fslightbox/3.4.1/index.min.js"></script>
        <style>
            body { background-color: #f8fafc; transition: background 0.3s; -webkit-tap-highlight-color: transparent; }
            @media (prefers-color-scheme: dark) { body { background-color: #0f172a; } }
            #main-header { position: fixed; top: 0; left: 0; right: 0; z-index: 100; transition: transform 0.3s ease-in-out; }
            .header-hidden { transform: translateY(-100%); }
            .glass-nav { backdrop-filter: blur(12px); border-bottom: 1px solid rgba(0,0,0,0.05); background: rgba(255,255,255,0.85); }
            @media (prefers-color-scheme: dark) { .glass-nav { background: rgba(15,23,42,0.85); border-bottom-color: rgba(255,255,255,0.05); } }
        </style>
    </head>
    <body class="text-slate-800 dark:text-slate-200">
        <header id="main-header">
            <nav class="glass-nav">
                <div class="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold shadow-sm">BOT</div>
                        <div>
                            <h1 id="channel-name" class="font-bold text-base leading-tight text-slate-900 dark:text-white">${config.title}</h1>
                            <p class="text-[11px] text-slate-500"><span id="channel-subs">0</span> Subscribers</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="relative flex h-2 w-2"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>
                        <span class="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">LIVE</span>
                    </div>
                </div>
            </nav>
            <div id="notice-banner" class="bg-blue-600 px-4 py-2 relative shadow-lg">
                <div class="max-w-3xl mx-auto flex items-center justify-center pr-8">
                    <div class="text-center">
                        <div class="text-white font-bold text-xs sm:text-sm tracking-widest">${config.contact}</div>
                        <div class="text-blue-100 text-[10px] mt-0.5">⚠️ 自动同步 Telegram 频道最新动态</div>
                    </div>
                </div>
                <button id="close-banner" class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-white/80">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
        </header>

        <main class="max-w-3xl mx-auto px-4 pt-32 pb-10 transition-all" id="content-main">
            <div id="msg-list" class="space-y-6 text-center py-20 text-slate-400 text-sm">Loading messages...</div>
        </main>

        <script>
            const header = document.getElementById('main-header');
            const banner = document.getElementById('notice-banner');
            const main = document.getElementById('content-main');
            const closeBtn = document.getElementById('close-banner');
            
            if (localStorage.getItem('notice_closed') === 'true') {
                banner.remove();
                main.style.paddingTop = '80px';
            }

            closeBtn.onclick = () => {
                banner.remove();
                localStorage.setItem('notice_closed', 'true');
                main.style.paddingTop = '80px';
            };

            let lastScrollY = window.scrollY;
            window.addEventListener('scroll', () => {
                if (window.scrollY > lastScrollY && window.scrollY > 150) {
                    header.classList.add('header-hidden');
                } else {
                    header.classList.remove('header-hidden');
                }
                lastScrollY = window.scrollY;
            });

            function escapeHTML(str) {
                return str.replace(/[&<>'"]/g, tag => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[tag]));
            }

            function renderMedia(msg) {
                if (msg.media_type === 'photo' && msg.file_id) {
                    const mediaUrl = \`/api/media?file_id=\${msg.file_id}\`;
                    return \`<a data-fslightbox="gallery" href="\${mediaUrl}" class="block mt-4 rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 cursor-zoom-in">
                        <img src="\${mediaUrl}" loading="lazy" class="w-full object-cover max-h-[500px]" onerror="this.parentElement.style.display='none'">
                    </a>\`;
                }
                return '';
            }

            async function load() {
                try {
                    const res = await (await fetch('/api/messages')).json();
                    document.getElementById('channel-subs').innerText = (res.channelInfo && res.channelInfo.subscribers) || "0";
                    const list = document.getElementById('msg-list');
                    if (!res.history || res.history.length === 0) {
                        list.innerHTML = '<div class="py-20 text-slate-500">No posts found.</div>';
                    } else {
                        list.className = "space-y-6 text-left";
                        list.innerHTML = res.history.map((m) => \`
                            <div class="bg-white dark:bg-slate-800 p-5 rounded-3xl shadow-sm border border-slate-200/60 dark:border-slate-700/50">
                                <div class="flex justify-between items-center mb-4">
                                    <span class="text-[10px] font-black uppercase tracking-tighter text-blue-600 dark:text-blue-400">CHANNEL POST</span>
                                    <span class="text-[10px] text-slate-400 font-mono">#\${m.id}</span>
                                </div>
                                <div class="text-slate-700 dark:text-slate-200 text-[15px] leading-relaxed whitespace-pre-wrap break-words">\${escapeHTML(m.text)}</div>
                                \${renderMedia(m)}
                                <div class="mt-5 pt-3 border-t border-slate-50 dark:border-slate-700/30 text-[10px] text-slate-400 flex justify-between">
                                    <span>Official Channel</span>
                                    <span>\${new Date(m.date * 1000).toLocaleString('zh-CN')}</span>
                                </div>
                            </div>\`).join('');
                        if(window.refreshFsLightbox) refreshFsLightbox();
                    }
                } catch(e) { }
            }
            load();
            setInterval(load, 30000);
        </script>
    </body>
    </html>`;

    return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
  }
};
