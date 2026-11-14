/**
 * DeepSeek API 地址改写：api.deepseek.com -> 中转站
 *
 * 在 Quantumult X 隧道内直接改写请求 URL，QX 用新地址出站，
 * 请求头（含 Authorization）原封不动带过去，不经过「重定向 -> 客户端再请求」。
 */

// 中转站地址。换成你自己的中转站时，只改这一行（或 fork 后改）。
const DEFAULT_TARGET = 'https://api.lmr-leavingnow.cn.mt';

// 只匹配 api.deepseek.com 本身，不匹配 api.deepseek.com.evil.com 这类前缀域名
const SOURCE = /^https:\/\/api\.deepseek\.com(?=\/|$)/i;

// 可选：不想改脚本时，预先用 $prefs 写入 DeepSeekForwardTarget 覆盖上面的默认值
function resolveTarget() {
  try {
    if (typeof $prefs !== 'undefined' && $prefs.valueForKey) {
      return $prefs.valueForKey('DeepSeekForwardTarget') || DEFAULT_TARGET;
    }
    if (typeof $persistentStore !== 'undefined') {
      return $persistentStore.read('DeepSeekForwardTarget') || DEFAULT_TARGET;
    }
  } catch (e) {}
  return DEFAULT_TARGET;
}

if (!SOURCE.test($request.url)) {
  $done({});
} else {
  const url = $request.url.replace(SOURCE, resolveTarget());
  console.log(`[deepseek-forward] ${$request.url} -> ${url}`);

  const out = { url };
  if ($request.headers) out.headers = $request.headers;
  $done(out);
}
