# 安全与性能指南

## 安全配置

### HTTPS

- 生产环境必须启用 HTTPS
- 配置 HSTS 头：`Strict-Transport-Security: max-age=31536000`
- 使用 TLS 1.2+

### 上传安全

- 限制上传文件类型：仅允许 `image/jpeg`, `image/png`, `image/webp`
- 限制文件大小：建议单文件不超过 20MB
- 文件名消毒：使用随机 ID 重命名，避免路径遍历

### EXIF 隐私

- 原图保留完整 EXIF 信息
- 派生图（展示图/缩略图）建议移除 GPS 等敏感信息
- 可通过 Sharp 配置：`sharp().withMetadata({ orientation: undefined })`

### 分享链接

- 使用随机码而非自增 ID
- 支持过期时间设置
- 权限控制：仅查看/可下载

### 环境变量

敏感配置通过环境变量管理，不要提交到代码仓库：

```ini
DB_PASSWORD=xxx
# 其他敏感配置
```

## 性能优化

### 图片处理

- 自动生成多尺寸派生图：
  - `display`: 1600px (详情页展示)
  - `medium`: 800px (列表展示)
  - `thumb`: 320px (缩略图)
- 使用 WebP 格式减少体积
- 懒加载：仅加载可视区域图片

### 缓存策略

服务端已配置的缓存头：

| 资源类型 | Cache-Control |
|---------|---------------|
| 图片/静态资源 | `public, max-age=31536000, immutable` |
| HTML | `no-cache` |

### CDN 加速

建议将 `/api/files/` 路径的图片资源通过 CDN 分发：

```nginx
location /api/files/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_cache_valid 200 365d;
    add_header Cache-Control "public, max-age=31536000";
}
```

### 数据库优化

- 为 `photos.album_id` 和 `photos.taken_at` 添加索引
- 使用分页查询，避免一次加载全部数据
- 批量查询派生图信息，避免 N+1 问题

### 请求优化

- 支持 Range 请求，大文件断点续传
- ETag 支持，304 响应减少传输
- CORS 配置白名单

## 监控建议

- 日志记录：上传/下载/错误
- 磁盘空间监控：storage 目录
- 数据库连接池监控
- 响应时间监控
