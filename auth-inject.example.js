/**
 * 307 跳转到中转站之后，把被客户端剥掉的 Authorization 补回去。
 *
 * 用法：复制这份文件，填上自己的 Key，放到只有自己能访问的地址
 * （私有服务器、secret gist 均可），再把 rewrite 规则指向它。
 * 带 Key 的版本不要提交到公开仓库。
 */

const API_KEY = 'sk-替换成你的中转站 Key';

const headers = Object.assign({}, $request.headers);
headers.Authorization = /^Bearer\s/i.test(API_KEY) ? API_KEY : `Bearer ${API_KEY}`;

$done({ headers });
