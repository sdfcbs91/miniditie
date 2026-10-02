# 本地化第三方资源（vendor）

本目录存放已从 CDN 下载到本地的第三方依赖，目的是**离线可用、不依赖外网**。
`index.html` 直接引用这里的文件，**没有任何构建步骤**：双击 `index.html` 即可运行。

| 文件 | 大小 | 来源 | 版本 | 许可 |
| --- | --- | --- | --- | --- |
| `tailwind-browser.js` | 275 KB | `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4` | 4.3.3 | MIT |
| `lucide.min.js` | 434 KB | `https://unpkg.com/lucide@latest/dist/umd/lucide.min.js` | 1.49.0 | ISC |
| `nunito.css` | 181 KB | `https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap` | v32 | OFL-1.1 |
| `fonts/*.woff2` | 137 KB（5 个） | `https://fonts.gstatic.com/s/nunito/v32/...` | v32 | OFL-1.1 |

## 说明

- **Tailwind** 用的是浏览器运行时版（`@tailwindcss/browser`），它会在页面加载时扫描 DOM 中的类名并现场生成 CSS。
  该 bundle 自包含，**运行时不会再去联网**（文件里出现的 `https://` 全部是注释中的文档链接）。
- **Lucide** 是 UMD 全量包（约 1500 个图标）。项目实际只用到 14 个
  （`users / pause / play / volume-2 / volume-x / mountain / train-front / layers / hand /
  alarm-clock / gift / circle-dot / arrow-right-left / rotate-ccw`），
  如果介意 434 KB，可以只打包用到的图标，但那需要改 `icons()` 的调用方式，暂未做。
- **Nunito** 是可变字体：Google 为 5 个字重各返回一条 `@font-face`，但 `src` 指向的是**同一批 5 个 woff2**
  （按 unicode-range 切成 cyrillic-ext / cyrillic / vietnamese / latin-ext / latin 子集）。
  本项目做了两步处理：① 按 `src` 去重（25 条 `@font-face` 压到 5 条，并把 `font-weight` 改成 `200 1000` 以覆盖全部字重）；
  ② 把 5 个 woff2 **base64 内联进 CSS** —— 因为 `file://` 下外部字体文件同样会被 CORS 拦截，
  不内联的话双击打开时字体会静默回退（文字能显示，但字体是错的）。
  中文字符不在 Nunito 覆盖范围内，会回退到 `system-ui`，这是预期行为。
- `fonts/*.woff2` 是字体源码备份，运行时**不会再被请求**（`nunito.css` 已内联），可安全删除。

## 重新下载

```bash
curl -L -o vendor/tailwind-browser.js https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4
curl -L -o vendor/lucide.min.js     https://unpkg.com/lucide@latest/dist/umd/lucide.min.js
curl -L -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" \
  -o vendor/nunito.css "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap"
```

> 字体的 User-Agent 必须伪装成现代浏览器，否则 Google 会返回老旧的 `ttf`/`eot` 格式而不是 `woff2`。

CSS 下载后（8.6 KB，`url()` 指向 `https://fonts.gstatic.com/...woff2`）还需要：
① 把 woff2 抓到 `vendor/fonts/`；② 按 `src` 去重 `@font-face`；③ 把 `url(https://...)` 换成 base64 data URI。
这三步是脚本完成的，不是手工编辑。
