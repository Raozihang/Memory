# 腾讯云 CDN 配置指南

本文档介绍如何为相册应用配置腾讯云 CDN，加速图片和静态资源的访问。

## 一、CDN 加速方案

### 推荐架构

```
用户 → 腾讯云 CDN → 源站服务器 (Nginx/Node.js)
                      ↓
                  /api/files/* (图片)
                  /assets/* (静态资源)
```

### 适合加速的资源

| 资源类型 | 路径 | 缓存策略 |
|---------|------|---------|
| 缩略图 | `/api/files/derivatives/*-thumb-*` | 长期缓存 (1年) |
| 中等尺寸 | `/api/files/derivatives/*-medium-*` | 长期缓存 (1年) |
| 展示图 | `/api/files/derivatives/*-display-*` | 长期缓存 (1年) |
| 原图 | `/api/files/originals/*` | 长期缓存 (1年) |
| 前端静态资源 | `/assets/*` | 长期缓存 (1年) |
| HTML | `/*.html` | 不缓存或短期 |

## 二、腾讯云控制台配置

### 1. 添加加速域名

1. 登录 [腾讯云 CDN 控制台](https://console.cloud.tencent.com/cdn)
2. 点击「域名管理」→「添加域名」
3. 填写配置：

| 配置项 | 值 |
|-------|-----|
| 加速域名 | `cdn.yourdomain.com` |
| 加速类型 | 静态加速 |
| 源站类型 | 自有源 |
| 源站地址 | `your-server-ip:8080` 或 `origin.yourdomain.com` |
| 回源协议 | HTTP (如源站有 HTTPS 则选 HTTPS) |
| 回源 Host | `origin.yourdomain.com` |

### 2. 缓存配置

进入域名管理 → 选择域名 → 缓存配置：

#### 节点缓存过期配置

添加以下规则（按优先级从高到低）：

| 类型 | 内容 | 缓存时间 |
|-----|------|---------|
| 文件后缀 | `jpg;jpeg;png;webp;gif` | 365 天 |
| 目录 | `/api/files/` | 365 天 |
| 文件后缀 | `js;css;woff2;woff;ttf` | 365 天 |
| 文件后缀 | `html` | 0 秒（不缓存） |
| 全部文件 | 全部文件 | 30 天 |

#### 状态码缓存

| 状态码 | 缓存时间 |
|-------|---------|
| 404 | 10 秒 |
| 403 | 10 秒 |

### 3. 回源配置

#### 回源请求头

添加以下请求头：

| 头部名称 | 头部值 |
|---------|-------|
| `X-Forwarded-For` | `$client_ip` |
| `X-Real-IP` | `$client_ip` |

#### Range 回源

- 开启「分片回源」，阈值设为 `2MB`
- 适合大图片的分段传输

### 4. HTTPS 配置

1. 进入「HTTPS 配置」
2. 上传 SSL 证书或使用腾讯云托管证书
3. 开启「强制 HTTPS」
4. HTTP/2 配置：开启

### 5. 访问控制（可选）

#### 防盗链配置

```
Referer 白名单：
- yourdomain.com
- *.yourdomain.com
- 允许空 Referer：是（移动端兼容）
```

#### IP 黑白名单

根据需要配置，一般不需要。

## 三、源站配置修改

### Nginx 配置（推荐）

如果使用 Nginx 反向代理，添加以下配置：

```nginx
server {
    listen 80;
    server_name origin.yourdomain.com;

    # 图片文件 - 长期缓存
    location /api/files/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # 缓存头 - CDN 会读取这些
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header X-Cache-Status $upstream_cache_status;
        
        # 支持 Range 请求
        proxy_set_header Range $http_range;
        proxy_set_header If-Range $http_if_range;
    }

    # API 请求 - 不缓存
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        add_header Cache-Control "no-cache, no-store";
    }

    # 静态资源
    location /assets/ {
        proxy_pass http://127.0.0.1:8080;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # 其他请求
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Node.js 服务端（已配置）

当前 `server/index.js` 已经设置了正确的缓存头：

```javascript
// 图片文件：长期缓存
res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')

// HTML：不缓存
res.setHeader('Cache-Control', 'no-cache')
```

## 四、前端配置修改

### 修改 API 基础路径

创建环境变量配置，让图片请求走 CDN：

```typescript
// frontend-react/src/lib/config.ts
export const config = {
  // CDN 域名，用于图片加速
  cdnBase: import.meta.env.VITE_CDN_BASE || '',
  // API 域名，用于接口请求
  apiBase: import.meta.env.VITE_API_BASE || '',
};
```

### 修改 api.ts

```typescript
// frontend-react/src/lib/api.ts
import { config } from './config';

export const api = {
  // ... 其他方法保持不变

  // 图片 URL 走 CDN
  getImageUrl: (key: string) => {
    const base = config.cdnBase || '';
    return `${base}/api/files/${encodeURIComponent(key)}`;
  },

  getPhotoUrl: (photo: Photo, size: 'thumb' | 'medium' | 'display' | 'original' = 'display') => {
    let key = photo.storage_key;
    if (size === 'thumb' && photo.thumb_key) key = photo.thumb_key;
    if (size === 'medium' && photo.medium_key) key = photo.medium_key;
    if (size === 'display' && photo.display_key) key = photo.display_key;
    
    const base = config.cdnBase || '';
    return `${base}/api/files/${encodeURIComponent(key)}`;
  },
};
```

### 环境变量配置

```bash
# frontend-react/.env.production
VITE_CDN_BASE=https://cdn.yourdomain.com
VITE_API_BASE=
```

## 五、DNS 配置

### CNAME 解析

在你的 DNS 服务商添加 CNAME 记录：

| 主机记录 | 记录类型 | 记录值 |
|---------|---------|-------|
| cdn | CNAME | `xxx.cdn.dnsv1.com` (腾讯云提供) |

### 验证配置

```bash
# 检查 CNAME 是否生效
nslookup cdn.yourdomain.com

# 测试 CDN 是否正常
curl -I https://cdn.yourdomain.com/api/files/derivatives/xxx-thumb-xxx.webp
```

响应头中应包含：
- `X-Cache-Lookup: Hit From MemCache` 或 `Hit From Disktank` 表示命中缓存

## 六、监控与优化

### 腾讯云监控

1. 进入 CDN 控制台 → 统计分析
2. 关注指标：
   - 命中率（目标 > 90%）
   - 带宽使用
   - 请求数
   - 状态码分布

### 缓存预热

对于新上传的图片，可以主动预热：

```bash
# 腾讯云 CLI 预热
tccli cdn PushUrlsCache --Urls '["https://cdn.yourdomain.com/api/files/xxx"]'
```

### 缓存刷新

如果图片更新需要刷新缓存：

```bash
# 刷新单个 URL
tccli cdn PurgeUrlsCache --Urls '["https://cdn.yourdomain.com/api/files/xxx"]'

# 刷新目录
tccli cdn PurgePathCache --Paths '["https://cdn.yourdomain.com/api/files/"]' --FlushType flush
```

## 七、成本优化

### 带宽计费 vs 流量计费

- 访问量稳定：选择带宽计费
- 访问量波动大：选择流量计费

### 推荐配置

1. 开启「智能压缩」- 自动 Gzip/Brotli
2. 开启「WebP 自适应」- 自动转换图片格式
3. 使用「中国境内」加速（如用户主要在国内）

## 八、故障排查

### 常见问题

| 问题 | 可能原因 | 解决方案 |
|-----|---------|---------|
| 图片 403 | 防盗链配置 | 检查 Referer 白名单 |
| 图片 504 | 源站超时 | 增加回源超时时间 |
| 缓存不生效 | 源站返回 no-cache | 检查源站 Cache-Control |
| HTTPS 证书错误 | 证书过期/不匹配 | 更新证书 |

### 调试命令

```bash
# 查看响应头
curl -I https://cdn.yourdomain.com/api/files/xxx

# 绕过 CDN 直接访问源站
curl -I https://origin.yourdomain.com/api/files/xxx

# 查看 CDN 节点
dig cdn.yourdomain.com
```
