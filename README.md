# Quantumult X · DeepSeek API 中转转发

用 Quantumult X 的请求脚本，把发往 `api.deepseek.com` 的请求在隧道内改写到中转站。请求头原样保留，`Authorization` 不会丢。

## 为什么 `url 307` 不行

```ini
^https:\/\/api\.deepseek\.com\/(.*)$ url 307 https://relay.example.com/$1
```

`url 307` 的机制是让 QX 给客户端回一个 307，由**客户端自己**再向中转站发一次请求。这一步有两个坑：

1. **跨源重定向会丢掉敏感请求头。** 按 Fetch 规范，重定向目标与原始地址不同源时，`Authorization`、`Cookie` 这类 CORS 非通配请求头必须被删除。不只是浏览器：`requests` 的 `rebuild_auth`、Go `net/http` 的 `shouldCopyHeaderOnRedirect` 在换域名时也会剥掉 `Authorization`。结果是 API Key 到不了中转站，中转站返回 401。
2. **不少客户端不跟随重定向**，或者跟随了却丢掉 POST body、把方法改成 GET，直接报错或拿到空响应。

顺带一提，这个坑和正则写得对不对无关，规则写得再精确也一样触发。

## 方案

`script-request-header` 脚本在 QX 隧道内改写 `$request.url`，QX 直接拿新地址出站，请求头不动。少一跳，也没有「客户端再请求」这回事。

```
客户端 --HTTPS--> QX(MitM) --改写 URL，原样带 headers--> 中转站
```

## 安装

两种方式选一种，别同时加，否则规则会重复触发。

### 方式一：远程重写资源（省事）

在配置文件的 `[rewrite_remote]` 里加一行，QX 会自动下载规则和脚本：

```ini
[rewrite_remote]
https://raw.githubusercontent.com/lejw0925/qx-deepseek-api-forward/main/rewrite.conf, tag=DeepSeek转发, enabled=true
```

`raw.githubusercontent.com` 不通就用 CDN 版资源（脚本也走 CDN）：

```ini
https://fastly.jsdelivr.net/gh/lejw0925/qx-deepseek-api-forward@main/rewrite-cdn.conf, tag=DeepSeek转发, enabled=true
```

资源文件里带了 `[mitm] hostname`，QX 一般会自动并入；没生效就按方式二第 2 步手动加。

> 注意：重写资源的格式和配置文件不同——里面**不能写任何段头**（`[rewrite_local]`、`[mitm]` 都会报 `invalid line`），`hostname` 直接裸写一行。`quantumultx.conf` 是手动并入用的配置片段，别当资源添加。

### 方式二：手动并入（可控）

1. 把下面的行并入 QX 配置文件的 `[rewrite_local]`：

   ```ini
   ^https:\/\/api\.deepseek\.com url script-request-header https://raw.githubusercontent.com/lejw0925/qx-deepseek-api-forward/main/deepseek-forward.js
   ```

   `raw.githubusercontent.com` 在国内经常连不上，拉取失败就换成 jsDelivr 镜像：

   ```ini
   ^https:\/\/api\.deepseek\.com url script-request-header https://fastly.jsdelivr.net/gh/lejw0925/qx-deepseek-api-forward@main/deepseek-forward.js
   ```

2. 把 `api.deepseek.com` 加进已有的 `[mitm]` 行：

   ```ini
   hostname = api.deepseek.com, 其他已有域名...
   ```

3. QX 里打开 MitM 开关，确认证书已安装并在系统里被信任（设置 → 证书 → 生成/安装 → 前往系统设置信任）。

配置片段见 [quantumultx.conf](quantumultx.conf)，脚本见 [deepseek-forward.js](deepseek-forward.js)。

## 修改目标地址

脚本顶部的 `DEFAULT_TARGET` 就是中转站地址，改这一行即可：

```js
const DEFAULT_TARGET = 'https://api.lmr-leavingnow.cn.mt';
```

不想动脚本的话，也可以预先用 `$prefs` 写一个 `DeepSeekForwardTarget` 覆盖它（Loon / Surge 用 `$persistentStore`，脚本对两者都做了兼容）。

## 验证

1. QX 的日志里应能看到每次改写的记录：

   ```
   [deepseek-forward] https://api.deepseek.com/v1/chat/completions -> https://你的中转站/v1/chat/completions
   ```

2. 在客户端里正常发一次请求，能返回结果就说明 `Authorization` 已经带到了中转站。

## 排查

- **401 / 鉴权失败**：先看日志里有没有改写记录。有记录但还是 401，说明问题在中转站那边（Key 是否支持该中转、余额、模型名），不是头被剥掉。
- **脚本完全没触发**：MitM 没开、证书没信任，或者 `hostname` 里漏了 `api.deepseek.com`。
- **改了脚本但不生效**：QX 会缓存远程脚本，重新添加规则或更新资源后再试。用 jsDelivr 的话，`@main` 本身也有缓存，改了脚本可能要等一会儿；想固定版本可以用 `@<commit sha>`。
- **QX 拉不到脚本**：`raw.githubusercontent.com` 被重置就换上面的 jsDelivr 镜像地址，两条规则只留一条。也可以用 `https://gh-proxy.com/https://raw.githubusercontent.com/...` 这类第三方加速前缀，但脚本会经过第三方，介意就别用。
- **添加重写资源时报 `invalid line rewrite_local` 或 `invalid line mitm`**：资源文件里写了段头。重写资源是「裸规则 + 裸 `hostname =` 行」，不能有 `[rewrite_local]` / `[mitm]` 段；用仓库里的 `rewrite.conf` / `rewrite-cdn.conf` 就不会有这个问题。
- **App 有 SSL Pinning**：MitM 拿不到明文，这套方案对它无效。DeepSeek 官方 SDK 一般没有。

## 更省心的做法

能改客户端配置的话，直接把 `base_url` 从 `https://api.deepseek.com` 换成中转站地址，不依赖 QX、不怕客户端不跟重定向、还少一跳延迟。这个仓库的价值只在于「客户端改不了 base_url」的场景。

Loon / Surge 也有等价的 `http-request` 脚本机制，同样返回 `$done({ url })`，思路一致，可以照着改。

## License

[MIT](LICENSE)
