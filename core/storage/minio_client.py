"""
MinIO客户端工具类
用于上传文章中的图片到MinIO对象存储
"""
from typing import Optional
import requests
from urllib.parse import urlparse
import hashlib
import os
from io import BytesIO
from core.config import cfg
from core.print import print_info, print_error, print_success, print_warning

try:
    from minio import Minio
    from minio.error import S3Error
    MINIO_AVAILABLE = True
except ImportError:
    MINIO_AVAILABLE = False
    print_warning("MinIO库未安装，图片上传功能将不可用。请运行: pip install minio")


class MinIOClient:
    """MinIO客户端单例类"""
    _instance = None
    _initialized = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        if not MINIO_AVAILABLE:
            self.client = None
            self._initialized = True
            return
        
        # 从配置读取MinIO设置
        self.endpoint = cfg.get("minio.endpoint", "")
        self.access_key = cfg.get("minio.access_key", "")
        self.secret_key = cfg.get("minio.secret_key", "")
        self.bucket_name = cfg.get("minio.bucket", "articles")
        self.secure = cfg.get("minio.secure", False)
        self.public_url = cfg.get("minio.public_url", "")
        self.enabled = cfg.get("minio.enabled", False)
        
        # 如果未启用或配置不完整，则不初始化客户端
        if not self.enabled or not self.endpoint or not self.access_key or not self.secret_key:
            self.client = None
            self._initialized = True
            if self.enabled:
                print_warning("MinIO已启用但配置不完整，图片上传功能将不可用")
            return
        
        try:
            self.client = Minio(
                self.endpoint,
                access_key=self.access_key,
                secret_key=self.secret_key,
                secure=self.secure
            )
            # 确保bucket存在
            if not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(self.bucket_name)
                print_success(f"创建MinIO bucket: {self.bucket_name}")
            self._initialized = True
            print_success(f"MinIO客户端初始化成功: {self.endpoint}/{self.bucket_name}")
        except Exception as e:
            print_error(f"MinIO客户端初始化失败: {str(e)}")
            self.client = None
            self._initialized = True
    
    def is_available(self) -> bool:
        """检查MinIO是否可用"""
        return self.client is not None and MINIO_AVAILABLE
    
    def upload_image(self, image_url: str, article_id: str) -> Optional[str]:
        """
        下载图片并上传到MinIO
        
        Args:
            image_url: 原始图片URL
            article_id: 文章ID，用于组织存储路径
            
        Returns:
            MinIO中的图片URL，失败返回None
        """
        if not self.is_available():
            return None
        
        try:
            # 下载图片
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            }
            response = requests.get(image_url, stream=True, timeout=20, headers=headers)
            response.raise_for_status()
            
            # 生成文件名
            parsed_url = urlparse(image_url)
            file_ext = os.path.splitext(parsed_url.path)[1] or '.jpg'
            if not file_ext.startswith('.'):
                file_ext = '.' + file_ext
            
            # 使用URL的hash作为文件名，避免重复
            url_hash = hashlib.md5(image_url.encode()).hexdigest()
            filename = f"{url_hash}{file_ext}"
            
            # MinIO中的路径：articles/{article_id}/{filename}
            object_name = f"articles/{article_id}/{filename}"
            
            # 上传到MinIO
            image_data = BytesIO(response.content)
            content_type = response.headers.get('Content-Type', 'image/jpeg')
            
            self.client.put_object(
                self.bucket_name,
                object_name,
                image_data,
                length=len(response.content),
                content_type=content_type
            )
            
            # 返回MinIO的访问URL
            if self.public_url:
                minio_url = f"{self.public_url.rstrip('/')}/{self.bucket_name}/{object_name}"
            else:
                # 如果没有配置public_url，使用endpoint构建
                protocol = "https" if self.secure else "http"
                minio_url = f"{protocol}://{self.endpoint}/{self.bucket_name}/{object_name}"
            
            print_info(f"图片上传成功: {image_url} -> {minio_url}")
            return minio_url
            
        except Exception as e:
            print_error(f"图片上传失败 {image_url}: {str(e)}")
            return None
    
    def upload_file(self, file_path: str, object_name: str) -> Optional[str]:
        """上传本地文件到MinIO"""
        if not self.is_available():
            return None
        
        try:
            self.client.fput_object(
                self.bucket_name,
                object_name,
                file_path
            )
            if self.public_url:
                return f"{self.public_url.rstrip('/')}/{self.bucket_name}/{object_name}"
            else:
                protocol = "https" if self.secure else "http"
                return f"{protocol}://{self.endpoint}/{self.bucket_name}/{object_name}"
        except Exception as e:
            print_error(f"文件上传失败 {file_path}: {str(e)}")
            return None

