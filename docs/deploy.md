# 部署指南

## 环境要求

- Node.js 16+
- (可选) MySQL 5.7+ / 8.0+
- (可选) Sharp 依赖的系统库

## 本地开发

```bash
# 1. 安装后端依赖
cd server
npm install

# 2. 安装前端依赖并构建
cd frontend-react
npm install
npm run build

# 3. 启动服务
cd server
node index.js
```

访问 http://localhost:8080

## 生产部署

### 方式一：直接部署

1. 构建前端：
   ```bash
   cd frontend-react
   npm run build
   ```

2. 配置环境变量 (`server/.env`)：
   ```ini
   PORT=8080
   USE_MYSQL=true
   DB_HOST=localhost
   DB_USER=album_user
   DB_PASSWORD=secure_password
   DB_NAME=album_db
   ```

3. 使用 PM2 启动：
   ```bash
   cd server
   pm2 start index.js --name album-server
   ```

### 方式二：Docker 部署

```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "8080:8080"
    environment:
      - USE_MYSQL=true
      - DB_HOST=db
      - DB_USER=album
      - DB_PASSWORD=password
      - DB_NAME=album_db
    volumes:
      - ./server/storage:/app/server/storage
    depends_on:
      - db

  db:
    image: mysql:8.0
    environment:
      - MYSQL_ROOT_PASSWORD=rootpassword
      - MYSQL_DATABASE=album_db
      - MYSQL_USER=album
      - MYSQL_PASSWORD=password
    volumes:
      - mysql_data:/var/lib/mysql

volumes:
  mysql_data:
```

### Nginx 反向代理

```nginx
server {
    listen 80;
    server_name album.example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 大文件上传支持
        client_max_body_size 100M;
    }
}
```

### HTTPS 配置

推荐使用 Certbot 自动配置 Let's Encrypt 证书：

```bash
certbot --nginx -d album.example.com
```

## 目录权限

确保以下目录有写入权限：

```bash
chmod 755 server/data
chmod 755 server/storage
chmod 755 server/storage/originals
chmod 755 server/storage/derivatives
```

## 其他部署方式

- [宝塔面板部署](DEPLOY_BT.md)
