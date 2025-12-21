"""API Key 使用日志记录中间件"""
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Callable
import uuid
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from core.models import ApiKey, ApiKeyLog
import core.db as db

DB = db.Db(tag="API Key 日志")

# 线程池执行器，用于异步执行日志记录
_log_executor = ThreadPoolExecutor(max_workers=5, thread_name_prefix="api_key_log")


def get_client_ip(request: Request) -> str:
    """获取客户端 IP 地址（考虑代理）"""
    # 优先从 X-Forwarded-For 获取（经过代理时）
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # X-Forwarded-For 可能包含多个 IP，取第一个
        ip = forwarded_for.split(",")[0].strip()
        if ip:
            return ip
    
    # 从 X-Real-IP 获取
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    
    # 从客户端直接获取
    if request.client:
        return request.client.host
    
    return "unknown"


class ApiKeyLoggingMiddleware(BaseHTTPMiddleware):
    """API Key 使用日志记录中间件"""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """处理请求并记录 API Key 使用日志"""
        # 提取 API Key
        api_key = self._extract_api_key(request)
        api_key_id = None
        
        # 如果存在 API Key，验证并获取 ID
        if api_key:
            api_key_id = await self._get_api_key_id(api_key)
            # 将 API Key ID 存储到 request.state，供后续使用
            request.state.api_key_id = api_key_id
        
        # 处理请求
        response = await call_next(request)
        
        # 如果使用了 API Key，记录日志（异步，不阻塞响应）
        if api_key_id:
            # 使用线程池异步执行日志记录，不阻塞响应
            _log_executor.submit(
                self._log_api_key_usage,
                api_key_id=api_key_id,
                endpoint=request.url.path,
                method=request.method,
                ip_address=get_client_ip(request),
                user_agent=request.headers.get("User-Agent", ""),
                status_code=response.status_code
            )
        
        return response
    
    def _extract_api_key(self, request: Request) -> str:
        """从请求头中提取 API Key"""
        # 方式1: 从 X-API-Key 头获取
        api_key = request.headers.get("X-API-Key")
        if api_key:
            return api_key
        
        # 方式2: 从 Authorization 头获取 (Bearer <api_key>)
        authorization = request.headers.get("Authorization", "")
        if authorization.startswith("Bearer "):
            api_key = authorization[7:]  # 去掉 "Bearer " 前缀
            # 如果看起来不像 JWT token（JWT 通常包含多个点），可能是 API Key
            if api_key and "." not in api_key:
                return api_key
        
        return None
    
    async def _get_api_key_id(self, api_key: str) -> str:
        """获取 API Key ID（如果有效）"""
        if not api_key:
            return None
        
        session = DB.get_session()
        try:
            api_key_obj = session.query(ApiKey).filter(
                ApiKey.key == api_key,
                ApiKey.is_active == True
            ).first()
            
            if api_key_obj:
                return api_key_obj.id
            return None
        except Exception as e:
            from core.print import print_error
            print_error(f"获取 API Key ID 失败: {str(e)}")
            return None
        finally:
            session.close()
    
    def _log_api_key_usage(
        self,
        api_key_id: str,
        endpoint: str,
        method: str,
        ip_address: str,
        user_agent: str,
        status_code: int
    ):
        """记录 API Key 使用日志（在后台线程中执行）"""
        session = DB.get_session()
        try:
            log_entry = ApiKeyLog(
                id=str(uuid.uuid4()),
                api_key_id=api_key_id,
                endpoint=endpoint,
                method=method,
                ip_address=ip_address,
                user_agent=user_agent[:500] if user_agent else None,  # 限制长度
                status_code=status_code,
                created_at=datetime.now()
            )
            session.add(log_entry)
            session.commit()
        except Exception as e:
            session.rollback()
            # 日志记录失败不影响响应，只记录错误
            from core.print import print_error
            print_error(f"API Key 日志记录失败: {str(e)}")
        finally:
            session.close()

