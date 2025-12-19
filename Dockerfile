# 使用 Python 官方镜像作为基础镜像（使用国内镜像源加速）
FROM --platform=$BUILDPLATFORM python:3.11-slim

# 设置环境变量
ENV DEBIAN_FRONTEND=noninteractive \
    TZ=Asia/Shanghai \
    PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple \
    PIP_DEFAULT_TIMEOUT=100

# 配置 Debian 国内镜像源（使用阿里云镜像）
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
    sed -i 's|http://deb.debian.org|http://mirrors.aliyun.com|g' /etc/apt/sources.list 2>/dev/null || \
    echo "deb http://mirrors.aliyun.com/debian/ bookworm main contrib non-free non-free-firmware" > /etc/apt/sources.list && \
    echo "deb http://mirrors.aliyun.com/debian/ bookworm-updates main contrib non-free non-free-firmware" >> /etc/apt/sources.list && \
    echo "deb http://mirrors.aliyun.com/debian-security/ bookworm-security main contrib non-free non-free-firmware" >> /etc/apt/sources.list

# 安装系统依赖（包括Node.js用于前端构建）
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    git \
    build-essential \
    zlib1g-dev \
    libgdbm-dev \
    libnss3-dev \
    libssl-dev \
    libreadline-dev \
    libffi-dev \
    libsqlite3-dev \
    procps \
    bash \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 安装Node.js（用于前端构建）
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

# 设置时区
RUN ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

# 设置工作目录
WORKDIR /app

# 复制依赖文件
COPY requirements.txt .

# 安装 uv 包管理器（用于快速安装 Python 依赖）
RUN pip install uv --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple

# 安装 Python 依赖（在构建时安装，避免运行时问题）
RUN uv pip install --system -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple || \
    pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 复制后端代码
COPY config.example.yaml config.yaml
COPY . .

# 安装 pnpm（用于前端构建）
RUN npm install -g pnpm

# 构建前端（如果存在web_ui目录）
RUN if [ -d "web_ui" ]; then \
    cd web_ui && \
    pnpm install && \
    pnpm build && \
    if [ -f "build.sh" ]; then bash build.sh; else \
        mkdir -p ../static && \
        cp -rf dist/* ../static/; \
    fi && \
    cd .. && \
    rm -rf web_ui/node_modules web_ui/dist; \
    fi

# 安装 Playwright 浏览器（Docker 环境默认安装）
# 注意：Playwright 是 Python 包，需要先安装 Python 依赖
ENV BROWSER_TYPE=${BROWSER_TYPE:-firefox}
# PLAYWRIGHT_BROWSERS_PATH 在运行时由 install.sh 设置
RUN python3 -m playwright install ${BROWSER_TYPE} --with-deps || \
    (echo "Playwright 浏览器安装失败，将在运行时安装" && true)

# 设置脚本权限
RUN chmod +x install.sh start.sh

# 暴露端口
EXPOSE 8001

# 启动命令
CMD ["bash", "start.sh"]