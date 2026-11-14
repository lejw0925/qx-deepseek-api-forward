# DeepSeek API 转发到中转站 · Quantumult X 实测结论

2026-11-14 更新：**用 QX 的请求脚本改 `$request.url` 把请求转发到另一个域名，在 QX 上不生效**，请求仍然发往 `api.deepseek.com`。下面是证据和真正可行的做法。

## 证据

1. HAR 里的 401 与直连 DeepSeek 一字不差：`Authentication Fails, Your api key: ****238f is invalid`，响应头是 `Server: openresty`、`x-ds-trace-id`、EdgeOne 的 `EO-*`，不是中转站的 Caddy。
2. 同一个 Key 直接请求中转站 `/chat/completions`，返回 200。
3. 把 `api.deepseek.com` 用 `--resolve` 指到中转站 IP，TLS 握手直接失败（中转站没有这个域名的证书），所以那个 401 不可能来自中转站。
4. QX 官方示例 `sample-rewrite-request-header.js` 返回的是 `$done({ path: ... })`：请求脚本的接口覆盖 path 和 headers，改 URL 的 host 不会重建连接。

另外注意：这类中转站发的是**自己的 Key**，不是 DeepSeek 官方 Key，直连 `api.deepseek.com` 必然是 401。

## 方案一：客户端直接连中转站（推荐）

在客户端的 API 设置里把 Base URL 填成中转站地址：

```
https://api.lmr-leavingnow.cn.mt
```

模型名用中转站提供的名字，Key 不变。QX 里的相关规则全部删掉。

这条路不依赖 MitM、不依赖重定向，流式输出也正常。

## 方案二：QX 307 + 补回 Authorization

客户端改不了 Base URL 时才用。思路：先用 307 把请求交给中转站，再由 QX 在跳转后的请求上把被客户端剥掉的 `Authorization` 补回去。

```ini
[rewrite_local]
^https:\/\/api\.deepseek\.com\/(.*)$ url 307 https://api.lmr-leavingnow.cn.mt/$1
^https:\/\/api\.lmr-leavingnow\.cn\.mt\/.* url script-request-header https://你的私有地址/auth-inject.js

[mitm]
hostname = api.deepseek.com, api.lmr-leavingnow.cn.mt
```

`auth-inject.js` 用仓库里的 [auth-inject.example.js](auth-inject.example.js) 复制一份，填上自己的 Key，放到只有自己能访问的地址（私有服务器、secret gist 都行）。**带 Key 的版本不要提交到公开仓库。**

前提：客户端跟随 307（307 会保留 POST body）。客户端不跟重定向的话，这条路走不通，只能回到方案一。

## 为什么不直接用脚本转发

```
客户端 --HTTPS--> QX(MitM) --脚本改 URL--> ??? 
```

连接在脚本执行前就已经建立在 `api.deepseek.com` 上了。脚本返回的 URL 里只有 path 会被采用，host 被忽略，所以请求还是发往 DeepSeek。日志里那行 `[deepseek-forward] ... -> ...` 只能说明脚本跑了，不代表请求改了目的地。

## 为什么不只用 `url 307`

跨源重定向时，客户端（CFNetwork、浏览器、`requests`、Go `net/http`）都会删掉 `Authorization` 这类敏感头，中转站收到的是没有 Key 的请求。所以 307 必须配合补头。

## 排查

- **401 且报文是 `Authentication Fails, Your api key: ****xxxx is invalid`**：请求到了 DeepSeek，不是中转站。检查 QX 规则是否真的把请求转出去了。
- **401 且报文是 `{"code":"API_KEY_REQUIRED", ...}`**：请求到了中转站，但没带 Key，检查 `auth-inject.js` 是否生效、MitM 是否覆盖中转站域名。
- **307 后客户端报错或空响应**：客户端不跟随重定向，用方案一。

## License

[MIT](LICENSE)
