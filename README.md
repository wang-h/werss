<div align="center">

<img src="https://raw.githubusercontent.com/wang-h/werss/main/static/logo.svg" alt="WeRSS Logo" width="100" height="100">

# WeRSS - 微信公众号热度分析系统

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Python](https://img.shields.io/badge/python-3.11+-green.svg)
![License](https://img.shields.io/badge/license-MIT-orange.svg)
![GitHub Stars](https://img.shields.io/github/stars/wang-h/werss?style=social)
![GitHub Forks](https://img.shields.io/github/forks/wang-h/werss?style=social)

**一个功能强大的微信公众号热度分析系统，支持自动采集、标签管理、多格式导出、主题词提取与热度追踪等功能**

[功能特性](#-功能特性) • [快速开始](#-快速开始) • [配置说明](#-配置说明) • [API文档](#-api文档) • [开发指南](#-开发指南)

</div>

---

## 📖 项目简介

WeRSS 是一个前后端分离的微信公众号热度分析系统，可以帮助用户将微信公众号文章转换为RSS订阅源，支持自动采集、内容管理、标签分类、多格式导出等功能。

### 技术栈

**后端：**
- **FastAPI** - 现代化的 Python Web 框架
- **SQLAlchemy** - Python ORM 框架
- **Playwright** - 浏览器自动化
- **APScheduler** - 定时任务调度

**前端：**
- **React 18** - UI 框架
- **TypeScript** - 类型系统
- **Vite** - 构建工具
- **Tailwind CSS** - 实用优先的 CSS 框架
- **Radix UI / shadcn/ui** - 组件库
- **React Router v6** - 路由管理
- **Zustand** - 状态管理
- **Axios** - HTTP 客户端

### 核心能力

- 🔄 **自动采集**：支持多种采集模式（web/api/app），自动抓取公众号文章
- 📰 **RSS生成**：将公众号文章转换为标准RSS订阅源
- 🏷️ **标签管理**：支持手动和AI自动标签提取
- 📤 **多格式导出**：支持PDF、Markdown格式导出
- 🔔 **消息通知**：支持钉钉、微信、飞书等通知方式
- 🔐 **用户认证**：完整的用户认证和权限管理
- ⏰ **定时任务**：自动执行文章采集和内容更新

---

## 🖼️ 界面预览

### 数据概览
<div align="center">
  <img src="https://raw.githubusercontent.com/wang-h/werss/main/images/dashboard.png" alt="数据概览（浅色主题）" width="800"/>
  <br/>
  <img src="https://raw.githubusercontent.com/wang-h/werss/main/images/dashboard-dark.png" alt="数据概览（深色主题）" width="800"/>
</div>

### 文章列表
<div align="center">
  <img src="https://raw.githubusercontent.com/wang-h/werss/main/images/articlelist.png" alt="文章列表" width="800"/>
</div>

### RSS订阅
<div align="center">
  <img src="https://raw.githubusercontent.com/wang-h/werss/main/images/rss.png" alt="RSS订阅" width="800"/>
</div>

---

## ✨ 功能特性

### 文章管理
- ✅ 自动采集微信公众号文章
- ✅ 支持多种采集模式（web/api/app）
- ✅ 文章内容自动提取和清理
- ✅ 文章搜索和筛选
- ✅ 文章标签分类管理

### RSS订阅
- ✅ 标准RSS 2.0格式输出
- ✅ 支持全文/摘要模式
- ✅ 自定义RSS标题、描述、封面
- ✅ 支持CDATA格式
- ✅ 分页支持

### 标签系统
- ✅ 手动标签管理
- ✅ 自动标签提取（TextRank/KeyBERT/AI）
- ✅ 基于公众号的自动标签关联
- ✅ 标签统计和分析

### 导出功能
- ✅ PDF导出（需启用）
- ✅ Markdown导出（需启用）
- ✅ 批量导出支持

### 图片存储
- ✅ MinIO 对象存储支持
- ✅ 文章图片自动下载和上传
- ✅ 图片URL自动替换为MinIO链接

### 通知系统
- ✅ 钉钉Webhook通知
- ✅ 企业微信Webhook通知
- ✅ 飞书Webhook通知
- ✅ 自定义Webhook通知
- ✅ 授权二维码过期通知

### 其他功能
- ✅ 用户认证和权限管理
- ✅ 系统配置管理
- ✅ 定时任务管理
- ✅ 系统信息监控
- ✅ 数据统计面板

---

## 🚀 快速开始

### 环境要求

**后端：**
- **Python**: 3.11 或更高版本
- **数据库**: SQLite / MySQL / PostgreSQL
- **浏览器**: Firefox / Chromium / WebKit（用于Playwright）

**前端：**
- **Node.js**: 18+ 或更高版本
- **包管理器**: pnpm（推荐）或 npm

### 方式一：一键启动开发环境（推荐）

```bash
# 克隆项目
git clone https://github.com/wang-h/werss.git
cd werss

# 运行一键启动脚本（自动配置环境、安装依赖、启动前后端）
chmod +x start_dev.sh
./start_dev.sh
```

启动后访问：
- 前端界面: http://localhost:3000
- 后台API: http://localhost:8001
- API文档: http://localhost:8001/api/docs

### 方式二：手动安装

#### 1. 安装系统依赖

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y \
    wget git build-essential zlib1g-dev \
    libgdbm-dev libnss3-dev libssl-dev libreadline-dev \
    libffi-dev libsqlite3-dev procps
```

**macOS:**
```bash
brew install python@3.11
```

#### 2. 创建虚拟环境

**使用 uv（推荐，更快）:**
```bash
# 安装 uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# 创建虚拟环境
uv venv

# 激活虚拟环境
source .venv/bin/activate  # Linux/Mac
# 或
.venv\Scripts\activate  # Windows
```

**使用传统方式:**
```bash
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# 或
venv\Scripts\activate  # Windows
```

#### 3. 安装Python依赖

```bash
# 使用 uv（推荐）
uv pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 或使用 pip
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

#### 4. 安装Playwright浏览器

```bash
playwright install firefox  # 或 webkit, chromium
```

#### 5. 配置环境

```bash
# 复制配置文件模板
cp config.example.yaml config.yaml

# 编辑配置文件（或使用环境变量）
vim config.yaml
```

#### 6. 初始化数据库

```bash
# 设置环境变量（首次运行需要）
export USERNAME=admin
export PASSWORD=your_password
export DB=sqlite:///data/db.db  # 或使用 PostgreSQL/MySQL

# 初始化数据库
python main.py -init True
```

#### 7. 启动后端服务

```bash
# 启动服务（包含定时任务）
python main.py -job True -init False

# 或仅启动API服务（不启动定时任务）
python main.py -job False -init False
```

#### 8. 前端开发（可选）

如果需要单独开发前端：

```bash
# 进入前端目录
cd web_ui

# 安装依赖（推荐使用 pnpm）
pnpm install
# 或使用 npm
npm install

# 创建前端环境变量文件
echo "VITE_API_BASE_URL=http://localhost:8001" > .env

# 启动前端开发服务器
pnpm dev
# 或
npm run dev
```

前端服务启动后访问：http://localhost:3000

### 方式三：Docker部署

#### 标准版本（使用官方镜像源）

```bash
# 构建镜像（会自动构建前端）
docker build -t werss:latest .

# 运行容器
docker run -d -p 8001:8001 werss:latest

# 访问应用
# 前端界面: http://localhost:8001
# API文档: http://localhost:8001/api/docs
```

#### 国内镜像源版本（推荐国内用户使用）

```bash
# 构建镜像（使用国内镜像源，构建速度更快）
docker build -f Dockerfile.cn -t werss:latest .

# 运行容器
docker run -d -p 8001:8001 werss:latest

# 访问应用
# 前端界面: http://localhost:8001
# API文档: http://localhost:8001/api/docs
```

**注意**：Docker 镜像已包含前端构建，无需单独启动前端服务。前端和 API 都通过 `http://localhost:8001` 访问。

如果使用 docker-compose：
```bash
# 使用 docker-compose（推荐）
# 进入项目根目录（包含 docker-compose.dev.yml 的目录）
cd <project-root>
docker-compose -f docker-compose.dev.yml up -d --build werss

# 查看日志
docker-compose -f docker-compose.dev.yml logs -f werss
```

---

## ⚙️ 配置说明

### 配置文件

项目使用 `config.yaml` 进行配置，首次运行请从模板复制：

```bash
cp config.example.yaml config.yaml
```

### 环境变量配置

项目支持通过环境变量覆盖配置文件中的设置，环境变量优先级更高：

```bash
# 数据库配置
export DB=postgresql://user:password@localhost:5432/werss_db

# 服务器配置
export PORT=8001
export DEBUG=False
export AUTO_RELOAD=False

# 用户认证（首次运行）
export USERNAME=admin
export PASSWORD=your_password

# 定时任务
export ENABLE_JOB=True
export THREADS=2

# RSS配置
export RSS_BASE_URL=https://your-domain.com/
export RSS_TITLE=我的RSS订阅
export RSS_DESCRIPTION=微信公众号热度分析系统

# 通知配置
export DINGDING_WEBHOOK=https://oapi.dingtalk.com/robot/send?access_token=xxx
export WECHAT_WEBHOOK=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx
export FEISHU_WEBHOOK=https://open.feishu.cn/open-apis/bot/v2/hook/xxx

# AI标签提取（可选）
export DEEPSEEK_API_KEY=sk-xxx
export DEEPSEEK_BASE_URL=https://api.deepseek.com
```

### 主要配置项说明

#### 数据库配置

```yaml
# SQLite（默认）
db: sqlite:///data/db.db

# PostgreSQL
db: postgresql://username:password@host:5432/database

# MySQL
db: mysql+pymysql://username:password@host:3306/database?charset=utf8mb4
```

#### RSS配置

```yaml
rss:
  base_url: https://your-domain.com/  # RSS域名地址
  local: False  # 是否为本地RSS链接
  title: 我的RSS订阅  # RSS标题
  description: 微信公众号热度分析系统  # RSS描述
  full_context: True  # 是否显示全文
  add_cover: True  # 是否添加封面图片
  page_size: 30  # RSS分页大小
```

#### 采集配置

```yaml
gather:
  content: False  # 是否采集内容
  model: app  # 采集模式：web/api/app
  content_auto_check: False  # 是否自动检查未采集文章
  content_auto_interval: 59  # 自动检查间隔（分钟）
  browser_type: firefox  # 浏览器类型：firefox/edge/webkit
```

#### 标签配置

```yaml
article_tag:
  auto_assign_by_mp: True  # 根据公众号自动关联标签
  auto_extract: False  # 是否自动提取标签
  extract_method: ai  # 提取方式：textrank/keybert/ai
  max_tags: 5  # 最大标签数量
```

#### MinIO配置（可选）

```yaml
minio:
  enabled: false  # 是否启用MinIO图片上传
  endpoint: "localhost:9000"  # MinIO服务地址
  access_key: "minioadmin"  # 访问密钥
  secret_key: "minioadmin"  # 密钥
  bucket: "articles"  # 存储桶名称
  secure: false  # 是否使用HTTPS
  public_url: "http://localhost:9000"  # 公开访问URL（可选）
```

启用 MinIO 后，文章爬取时会自动下载图片并上传到 MinIO，文章内容中的图片 URL 会被替换为 MinIO 链接。

更多配置项请参考 `config.example.yaml` 文件。

---

## 📚 API文档

启动服务后，可以通过以下地址访问API文档：

- **Swagger UI**: http://localhost:8001/api/docs
- **ReDoc**: http://localhost:8001/api/redoc
- **OpenAPI Schema**: http://localhost:8001/api/openapi.json

### 主要API端点

#### 认证相关
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 用户登出
- `GET /api/auth/me` - 获取当前用户信息

#### 公众号管理
- `GET /api/mps` - 获取公众号列表
- `POST /api/mps` - 添加公众号
- `PUT /api/mps/{id}` - 更新公众号
- `DELETE /api/mps/{id}` - 删除公众号

#### 文章管理
- `GET /api/articles` - 获取文章列表
- `GET /api/articles/{id}` - 获取文章详情
- `DELETE /api/articles/{id}` - 删除文章

#### RSS订阅
- `GET /feeds/{mp_id}.xml` - 获取公众号RSS订阅源
- `GET /feeds/all.xml` - 获取所有文章RSS订阅源

更多API详情请查看Swagger文档。

---

## 🛠️ 开发指南

### 项目结构

```
werss/
├── apis/              # API路由层
│   ├── article.py     # 文章相关API
│   ├── auth.py        # 认证相关API
│   ├── mps.py         # 微信公众号相关API
│   ├── rss.py         # RSS相关API
│   └── ...
├── core/              # 核心业务逻辑
│   ├── config.py      # 配置管理
│   ├── database.py    # 数据库操作
│   ├── wx/            # 微信公众号核心逻辑
│   ├── models/        # 数据模型
│   ├── notice/        # 通知模块
│   └── ...
├── jobs/              # 定时任务
│   ├── article.py     # 文章采集任务
│   ├── mps.py         # 公众号更新任务
│   └── ...
├── driver/            # 浏览器驱动（Playwright）
├── web_ui/            # 前端React应用
│   ├── src/           # 前端源代码
│   │   ├── api/       # API接口封装
│   │   ├── components/# 组件
│   │   ├── views/     # 页面组件
│   │   └── ...
│   ├── package.json   # 前端依赖配置
│   └── vite.config.ts # Vite配置
├── main.py            # 应用入口
├── web.py             # FastAPI应用定义
├── config.example.yaml # 配置文件模板
└── requirements.txt   # Python依赖
```

### 开发环境设置

详细开发指南请参考：
- [快速开始指南](QUICK_START.md) - 开发环境快速设置
- [开发指南](DEVELOPMENT.md) - 完整的开发文档
- [uv使用指南](UV_VENV_GUIDE.md) - uv虚拟环境使用说明

### 添加新功能

1. **添加新API**：
   ```python
   # 在 apis/ 目录下创建新文件
   # apis/my_feature.py
   from fastapi import APIRouter
   
   router = APIRouter(prefix="/my-feature", tags=["我的功能"])
   
   @router.get("/")
   async def my_endpoint():
       return {"message": "Hello"}
   
   # 在 web.py 中注册路由
   from apis.my_feature import router as my_feature_router
   api_router.include_router(my_feature_router)
   ```

2. **修改数据库模型**：
   ```python
   # 在 core/models/ 下修改模型
   # 然后运行迁移
   python main.py -init True
   ```

3. **添加定时任务**：
   ```python
   # 在 jobs/ 目录下创建任务文件
   # 任务会自动注册
   ```

### 代码规范

- 遵循 Python PEP 8 代码规范
- 使用类型提示（Type Hints）
- 编写清晰的注释和文档字符串

---

## 🔧 常见问题

### 1. 端口被占用

```bash
# 检查端口占用
lsof -i :8001  # Linux/Mac
netstat -ano | findstr :8001  # Windows

# 修改端口
export PORT=8002
python main.py -job True -init False
```

### 2. 数据库连接失败

- 检查数据库服务是否启动
- 确认连接字符串格式正确
- 检查数据库用户权限

### 3. Playwright浏览器未安装

```bash
playwright install firefox
# 或
playwright install chromium
```

### 4. 依赖安装失败

```bash
# 使用国内镜像
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 或使用uv（推荐）
uv pip install -r requirements.txt
```

### 5. 权限问题

```bash
# 确保脚本有执行权限
chmod +x start.sh start_dev.sh

# 确保数据目录可写
mkdir -p data
chmod 755 data
```

更多问题请查看 [开发指南](DEVELOPMENT.md) 或提交 Issue。

---

## 📦 依赖说明

### 核心依赖

- **FastAPI**: Web框架
- **SQLAlchemy**: ORM框架
- **Playwright**: 浏览器自动化
- **APScheduler**: 定时任务调度
- **PyJWT**: JWT认证
- **BeautifulSoup4**: HTML解析
- **jieba**: 中文分词
- **KeyBERT**: 关键词提取（可选）

### 可选依赖

- **psycopg2-binary**: PostgreSQL支持
- **PyMySQL**: MySQL支持
- **reportlab**: PDF导出支持
- **python-docx**: Word文档处理
- **minio**: MinIO 对象存储客户端（用于图片存储）

完整依赖列表请查看 `requirements.txt`。

---

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. [Fork 本项目](https://github.com/wang-h/werss/fork)
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. [开启 Pull Request](https://github.com/wang-h/werss/pulls)

详细贡献指南请查看 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 📄 许可证

本项目采用 MIT 许可证。详情请查看 [LICENSE](LICENSE) 文件。

---

## 🙏 致谢

本项目在开发过程中参考和借鉴了以下优秀的开源项目，特此表示感谢：

- **[we-mp-rss](https://github.com/rachelos/we-mp-rss)** - 微信公众号热度分析系统，提供了核心功能实现的参考
- **[wewe-rss](https://github.com/cooderl/wewe-rss)** - 微信公众号RSS订阅工具，提供了架构设计的灵感
- **[full-stack-fastapi-template](https://github.com/fastapi/full-stack-fastapi-template)** - FastAPI 全栈项目模板，提供了前后端分离架构的最佳实践

感谢这些项目的开发者和贡献者们！

---

## 🔗 相关链接

- [快速开始指南](QUICK_START.md)
- [开发指南](DEVELOPMENT.md)
- [uv使用指南](UV_VENV_GUIDE.md)
- [贡献指南](CONTRIBUTING.md)

---

## 📞 支持

如有问题或建议，请通过以下方式联系：

- [提交 Issue](https://github.com/wang-h/werss/issues)
- [发送 Pull Request](https://github.com/wang-h/werss/pulls)
- [查看项目文档](https://github.com/wang-h/werss)

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给个 Star ⭐**

Made with ❤️ by Hao 

</div>
