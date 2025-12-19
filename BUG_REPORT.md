# Werss 网站 Bug 报告

测试账号: admin / admin@123 (默认密码)
测试时间: 2024-12-19

## 已发现的 Bug

### 1. ✅ 已修复 - 登录功能
**状态**: 已修复
**说明**: 使用默认密码 `admin@123` 可以成功登录

### 2. 静态资源加载失败
**严重程度**: 🟡 中等
**描述**:
- `/static/logo.svg` 返回 500 (Internal Server Error) 或 404 (Not Found)
- 控制台显示多次加载失败

**相关文件**:
- `web_ui/vite.config.ts`: 静态资源代理配置
- `web.py`: 静态文件服务配置

### 3. 前端 API 配置问题
**严重程度**: 🟡 中等
**描述**:
- `web_ui/src/api/http.ts` 中 baseURL 配置为 `(import.meta.env.VITE_API_BASE_URL || '') + 'api/v1/'`
- 如果 `VITE_API_BASE_URL` 为空，baseURL 为 `api/v1/`（相对路径）
- 这可能导致请求未正确通过 vite 代理

**建议修复**:
- 开发环境应使用 `/api/v1/` 作为 baseURL，通过 vite 代理
- 生产环境使用完整的 API URL

### 4. 密码输入框缺少 autocomplete 属性
**严重程度**: 🟢 轻微
**描述**:
- 控制台警告：Input elements should have autocomplete attributes (suggested: "current-password")
- 影响用户体验和浏览器自动填充功能

**相关文件**:
- `web_ui/src/views/Login.tsx`: 登录页面组件

### 5. React Router Future Flag 警告
**严重程度**: 🟢 轻微
**描述**:
- 控制台警告：React Router Future Flag Warning
- 建议使用 `v7_startTransition` future flag

**相关文件**:
- `web_ui/src/router/index.tsx`: 路由配置

### 6. Dashboard API 返回 500 错误
**严重程度**: 🔴 严重
**描述**:
- `/api/v1/wx/dashboard/stats` API 返回 500 (Internal Server Error)
- 前端有回退机制，使用文章数据计算统计信息，但 API 调用失败
- 控制台显示: "Dashboard API 调用失败，使用回退计算（基于文章 publish_time）"

**相关文件**:
- `apis/dashboard.py`: Dashboard API 实现
- `web_ui/src/views/Dashboard.tsx`: Dashboard 页面组件

**测试结果**:
- 页面可以显示，但数据来自回退计算，不是 API 返回的统计数据

### 7. 文章列表页面 - 文章链接指向 "#"
**严重程度**: 🟡 中等
**描述**:
- 文章列表中的文章标题链接指向 `#`，无法跳转到文章详情页
- 所有文章链接都是 `href="#"`，没有实际的详情页路由

**相关文件**:
- `web_ui/src/views/ArticleListPage.tsx`: 文章列表页面组件

## 已测试功能

- [x] 登录功能 - ✅ 正常（使用默认密码 admin@123）
- [x] 文章列表页面 - ⚠️ 部分正常（链接指向 #）
- [x] 订阅管理页面 - ✅ 正常
- [x] 仪表板页面 - ⚠️ API 错误但有回退机制
- [x] 标签管理页面 - ✅ 正常
- [x] 配置管理页面 - ✅ 正常
- [x] 消息任务页面 - ✅ 正常（暂无数据，但页面正常显示）
- [x] 系统信息页面 - ✅ 正常
- [x] 用户设置和密码修改 - ✅ 菜单正常显示（个人中心、修改密码、设置等选项可用）

## Bug 总结

### 严重 Bug (🔴)
1. **Dashboard API 返回 500 错误** - 需要修复后端 API

### 中等严重 Bug (🟡)
2. **静态资源加载失败** - `/static/logo.svg` 返回 500/404
3. **文章列表页面链接问题** - 文章链接指向 `#`，无法跳转详情页
4. **前端 API 配置问题** - baseURL 配置可能需要优化

### 轻微问题 (🟢)
5. **密码输入框缺少 autocomplete 属性** - 影响浏览器自动填充
6. **React Router Future Flag 警告** - 建议升级配置

## 建议的修复优先级

1. **高优先级**: 修复 Dashboard API 500 错误
2. **高优先级**: 修复文章列表链接，添加文章详情页路由
3. **中优先级**: 修复静态资源加载问题
4. **中优先级**: 优化前端 API baseURL 配置
5. **低优先级**: 修复 autocomplete 属性和 React Router 警告

## 测试总结

✅ **正常功能**:
- 登录认证
- 订阅管理
- 标签管理
- 配置管理
- 消息任务（页面正常，暂无数据）
- 系统信息

⚠️ **部分问题**:
- 仪表板（API 错误但有回退机制）
- 文章列表（链接问题）

🔴 **需要修复**:
- Dashboard API 500 错误
- 文章详情页路由缺失

