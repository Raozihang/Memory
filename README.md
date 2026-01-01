# Album 照片回忆网站

一个现代化的照片相册管理系统，支持照片上传、相册管理、时间轴浏览和分享功能。

## 技术栈

**前端**
- React 18 + TypeScript
- React Router v6 (SPA 路由)
- TanStack Query (数据请求)
- Tailwind CSS + Framer Motion (样式与动画)
- Masonic (瀑布流布局)
- Vite (构建工具)

**后端**
- Node.js (原生 HTTP 服务器)
- MySQL
- Sharp (图片处理)

## 目录结构

```
├── frontend-react/     # React 前端应用
│   ├── src/
│   │   ├── components/ # 通用组件
│   │   ├── pages/      # 页面组件
│   │   └── lib/        # 工具函数
│   └── dist/           # 构建产物
├── server/             # Node.js 后端
│   ├── data/           # JSON 数据文件 (JSON 模式)
│   ├── storage/        # 图片存储目录
│   │   ├── originals/  # 原图
│   │   └── derivatives/# 缩略图/展示图
│   ├── index.js        # 服务入口
│   ├── dao.js          # 数据访问层
│   └── db.js           # MySQL 连接
└── docs/               # 项目文档
```

## 快速开始

### 1. 安装依赖

```bash
# 后端
cd server
npm install

# 前端
cd frontend-react
npm install
```

### 2. 配置环境变量

在 `server/` 目录创建 `.env` 文件：

```ini
# 服务端口
PORT=8080

# 数据库配置 (可选，默认使用 JSON 文件存储)
USE_MYSQL=false
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=album_db
DB_PORT=3306
```

### 3. 构建前端

```bash
cd frontend-react
npm run build
```

### 4. 启动服务

```bash
cd server
node index.js
```

访问 http://localhost:8080 即可使用。

## 主要功能

- **首页** - 展示相册列表
- **相册详情** - 瀑布流展示照片，支持灯箱预览
- **时间轴** - 按日期聚合浏览照片
- **上传** - 支持批量上传，自动生成缩略图
- **分享** - 生成分享链接
- **导出** - 打包下载相册原图

## 文档

- [数据库文档](docs/database.md) - 数据库结构
- [部署指南](docs/deploy.md) - 部署说明
- [安全说明](docs/security.md) - 安全与性能建议

## License

ISC
