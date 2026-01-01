# 数据库文档

## MySQL 数据库

### 环境要求

- MySQL 5.7+ 或 8.0+
- Node.js 14+

### 配置

在 `server/.env` 中配置数据库连接：

```ini
USE_MYSQL=true
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=album_db
DB_PORT=3306
```

### 数据库表结构

#### albums (相册表)

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | VARCHAR(255) | 主键 |
| `title` | VARCHAR(255) | 相册标题 |
| `description` | TEXT | 相册描述 |
| `cover_photo_id` | VARCHAR(255) | 封面照片 ID |
| `created_at` | DATETIME | 创建时间 |
| `updated_at` | DATETIME | 更新时间 |

#### photos (照片表)

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | VARCHAR(255) | 主键 |
| `album_id` | VARCHAR(255) | 所属相册 ID |
| `filename` | VARCHAR(255) | 原始文件名 |
| `storage_key` | VARCHAR(255) | 存储路径 |
| `mime` | VARCHAR(255) | MIME 类型 |
| `bytes` | BIGINT | 文件大小 (字节) |
| `taken_at` | DATETIME | 拍摄时间 |
| `created_at` | DATETIME | 上传时间 |

#### derivatives (派生图表)

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INT | 主键 (自增) |
| `photo_id` | VARCHAR(255) | 关联照片 ID |
| `type` | VARCHAR(50) | 类型: display/medium/thumb |
| `storage_key` | VARCHAR(255) | 存储路径 |

#### exif (EXIF 元数据表)

| 字段 | 类型 | 说明 |
|------|------|------|
| `photo_id` | VARCHAR(255) | 主键，关联照片 ID |
| `exif_json` | JSON | EXIF 数据 |

## 文件存储

图片文件存储在 `server/storage/` 目录：

```
storage/
├── originals/      # 原图
│   └── {id}-{filename}
└── derivatives/    # 派生图
    ├── {id}-display-{name}.webp  # 展示图 (1600px)
    ├── {id}-medium-{name}.webp   # 中等图 (800px)
    └── {id}-thumb-{name}.webp    # 缩略图 (320px)
```

派生图由 Sharp 库自动生成，如未安装 Sharp 则使用上传时提供的预处理图片。
