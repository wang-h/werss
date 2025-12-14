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
    description="微信公众号RSS生成服务API文档",
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

resource_router = APIRouter(prefix="/static")
resource_router.include_router(res_router)
feeds_router = APIRouter()
feeds_router.include_router(rss_router)
feeds_router.include_router(feed_router)
# 注册API路由分组
app.include_router(api_router)
app.include_router(resource_router)
app.include_router(feeds_router)

# 用户上传文件服务（保留，因为这是业务功能，不是前端静态文件）
from starlette.staticfiles import StaticFiles
from core.res.avatar import files_dir
app.mount("/files", StaticFiles(directory=files_dir), name="files")

# 根路由 - 返回API信息
@app.get("/",tags=['默认'],include_in_schema=False)
async def serve_root(request: Request):
    """处理根路由 - 前后端分离架构，后端只提供API"""
    from fastapi.responses import JSONResponse
    return JSONResponse({
        "name": "WeRSS API",
        "version": VERSION,
        "status": "running",
        "docs": f"{request.base_url}api/docs",
        "message": "前后端分离架构：前端由独立服务器提供，后端只提供API服务"
    })

# 404处理 - 对于未匹配的路由返回API信息
@app.get("/{path:path}",tags=['默认'],include_in_schema=False)
async def catch_all(request: Request, path: str):
    """捕获所有未匹配的路由 - 前后端分离架构，后端只提供API"""
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=404,
        content={
            "error": "Not Found",
            "message": "该路径不存在。前后端分离架构，前端由独立服务器提供",
            "api_docs": f"{request.base_url}api/docs"
        }
    )