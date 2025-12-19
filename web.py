from fastapi import FastAPI, Request, APIRouter, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.openapi.models import OAuthFlows as OAuthFlowsModel
from fastapi.openapi.models import OAuthFlowPassword
from fastapi.openapi.utils import get_openapi
from apis.auth import router as auth_router
from apis.user import router as user_router
from apis.article import router as article_router
from apis.mps import router as wx_router
from apis.res import router as res_router
from apis.rss import router as rss_router,feed_router
from apis.config_management import router as config_router
from apis.message_task import router as task_router
from apis.sys_info import router as sys_info_router
from apis.tags import router as tags_router
from apis.article_tag import router as article_tag_router
from apis.export import router as export_router
from apis.tools import router as tools_router
from apis.github_update import router as github_router
from apis.dashboard import router as dashboard_router
import apis
import os
from core.config import cfg,VERSION,API_BASE

app = FastAPI(
    title="WeRSS API",
    description="微信公众号热度分析系统API文档",
    version="1.0.0",
    docs_url="/api/docs",  # 指定文档路径
    redoc_url="/api/redoc",  # 指定Redoc路径
    # 指定OpenAPI schema路径
    openapi_url="/api/openapi.json",
    openapi_tags=[
        {
            "name": "认证",
            "description": "用户认证相关接口",
        }
    ],
    swagger_ui_parameters={
        "persistAuthorization": True,
        "withCredentials": True,
    }
)

# CORS配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.middleware("http")
async def add_custom_header(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Version"] = VERSION
    response.headers["Server"] = cfg.get("app_name", "WeRSS")
    # 为静态资源添加缓存控制头
    if request.url.path.startswith(("/assets/", "/static/")):
        # 开发环境禁用缓存，生产环境可以设置较长的缓存时间
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response
# 创建API路由分组
api_router = APIRouter(prefix=f"{API_BASE}")
api_router.include_router(auth_router)
api_router.include_router(user_router)
api_router.include_router(article_router)
api_router.include_router(wx_router)
api_router.include_router(config_router)
api_router.include_router(task_router)
api_router.include_router(sys_info_router)
api_router.include_router(tags_router)
api_router.include_router(article_tag_router)
api_router.include_router(export_router)
api_router.include_router(tools_router)
api_router.include_router(github_router)
api_router.include_router(dashboard_router)

# 添加独立的健康检查端点（用于 Docker healthcheck）
# 注意：这个端点不通过 API_BASE，直接使用 /api/v1/sys/version
@app.get("/api/v1/sys/version", tags=["健康检查"], include_in_schema=False)
async def health_check_version():
    """健康检查端点，返回版本信息"""
    try:
        from apis.ver import API_VERSION
        from core.config import VERSION as CORE_VERSION
        from fastapi.responses import JSONResponse
        return JSONResponse({
            'api_version': API_VERSION,
            'core_version': CORE_VERSION,
            'status': 'running'
        })
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=500,
            content={'error': str(e), 'status': 'error'}
        )

# 资源反向代理路由（处理 /static/res/logo/ 路径）
# 注意：resource_router 只处理 /static/res/logo/ 路径，其他 /static/ 路径由静态文件服务处理
resource_router = APIRouter(prefix="/static")
resource_router.include_router(res_router)  # res_router 的 prefix 是 /res，所以完整路径是 /static/res/logo/{path:path}
feeds_router = APIRouter()
feeds_router.include_router(rss_router)
feeds_router.include_router(feed_router)
# 注册API路由分组
app.include_router(api_router)
app.include_router(resource_router)  # 处理 /static/res/logo/ 路径
app.include_router(feeds_router)

# 静态文件服务（支持 HEAD 方法，用于 wx_qrcode.png 等文件）
# 注意：在 resource_router 之后挂载，这样 /static/res/logo/ 会被 resource_router 处理
# 而其他 /static/ 路径（如 /static/wx_qrcode.png）会被静态文件服务处理
# FastAPI 的路由匹配顺序：先匹配 include_router（精确匹配），再匹配 mount
from starlette.staticfiles import StaticFiles
from core.res.avatar import files_dir
# 挂载 static 目录，支持 HEAD 方法检查文件是否存在
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")
    # 挂载 assets 目录，因为前端构建后的文件路径是 /assets/...
    assets_dir = os.path.join(static_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
# 用户上传文件服务（保留，因为这是业务功能，不是前端静态文件）
app.mount("/files", StaticFiles(directory=files_dir), name="files")

# 根路由和前端路由 - 返回前端页面（SPA应用）
@app.get("/",tags=['默认'],include_in_schema=False)
async def serve_root(request: Request):
    """处理根路由 - 返回前端页面"""
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        from fastapi.responses import FileResponse
        return FileResponse(index_path)
    else:
        # 如果前端文件不存在，返回API信息
        from fastapi.responses import JSONResponse
        return JSONResponse({
            "name": "WeRSS API",
            "version": VERSION,
            "status": "running",
            "docs": f"{request.base_url}api/docs",
            "message": u"前端文件未找到，请先构建前端"
        })

# SPA路由处理 - 对于前端路由返回index.html
# 注意：不匹配 /api/, /static/, /files/ 路径
@app.get("/{path:path}",tags=['默认'],include_in_schema=False)
@app.head("/{path:path}",tags=['默认'],include_in_schema=False)
async def catch_all(request: Request, path: str):
    """捕获所有未匹配的路由 - SPA应用，返回前端页面"""
    # 跳过API路径
    if path.startswith("api/"):
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=404,
            content={
                "error": "Not Found",
                "message": u"API路径不存在",
                "api_docs": f"{request.base_url}api/docs"
            }
        )
    
    # 跳过静态文件路径，这些路径应该由静态文件服务处理
    if path.startswith("static/") or path.startswith("files/") or path.startswith("assets/"):
        from fastapi.responses import Response
        return Response(status_code=404)
    
    # 对于其他路径（前端路由），返回index.html
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        from fastapi.responses import FileResponse
        return FileResponse(index_path)
    else:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=404,
            content={
                "error": "Not Found",
                "message": u"前端文件未找到，请先构建前端",
                "api_docs": f"{request.base_url}api/docs"
            }
        )