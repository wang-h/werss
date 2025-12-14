"""文章标签管理 API"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
from pydantic import BaseModel
from core.models.article_tags import ArticleTag
from core.models.tags import Tags as TagsModel
from core.models.article import Article
from core.database import get_db
from sqlalchemy.orm import Session
from .base import success_response, error_response
from core.auth import get_current_user


router = APIRouter(prefix="/articles/{article_id}/tags", tags=["文章标签管理"])


class TagResponse(BaseModel):
    """标签响应模型"""
    id: str
    name: str
    cover: Optional[str] = None
    intro: Optional[str] = None


@router.get("", 
    summary="获取文章的标签列表",
    description="获取指定文章关联的所有标签"
)
async def get_article_tags(
    article_id: str,
    db: Session = Depends(get_db),
    cur_user: dict = Depends(get_current_user)
):
    """
    获取文章的标签列表
    
    参数:
    - article_id: 文章ID
    
    返回:
    - 包含标签列表的成功响应
    """
    try:
        # 检查文章是否存在
        article = db.query(Article).filter(Article.id == article_id).first()
        if not article:
            return error_response(code=404, message="Article not found")
        
        # 查询文章关联的标签
        article_tags = db.query(ArticleTag).filter(
            ArticleTag.article_id == article_id
        ).all()
        
        # 获取标签详情
        tag_ids = [at.tag_id for at in article_tags]
        tags = db.query(TagsModel).filter(TagsModel.id.in_(tag_ids)).all()
        
        # 构建响应
        tag_list = [
            {
                "id": tag.id,
                "name": tag.name,
                "cover": tag.cover,
                "intro": tag.intro
            }
            for tag in tags
        ]
        
        return success_response(data={
            "article_id": article_id,
            "tags": tag_list,
            "total": len(tag_list)
        })
    except Exception as e:
        from core.print import print_error
        print_error(f"获取文章标签失败: {e}")
        return error_response(code=500, message=f"获取文章标签失败: {str(e)}")


@router.post("",
    summary="为文章添加标签",
    description="为指定文章关联一个标签"
)
async def add_article_tag(
    article_id: str,
    tag_id: str = Query(..., description="标签ID"),
    db: Session = Depends(get_db),
    cur_user: dict = Depends(get_current_user)
):
    """
    为文章添加标签
    
    参数:
    - article_id: 文章ID
    - tag_id: 标签ID（Tags 表的 ID）
    
    返回:
    - 成功响应
    """
    try:
        import uuid
        from datetime import datetime
        
        # 检查文章是否存在
        article = db.query(Article).filter(Article.id == article_id).first()
        if not article:
            return error_response(code=404, message="Article not found")
        
        # 检查标签是否存在
        tag = db.query(TagsModel).filter(TagsModel.id == tag_id).first()
        if not tag:
            return error_response(code=404, message="Tag not found")
        
        # 检查是否已存在关联
        existing = db.query(ArticleTag).filter(
            ArticleTag.article_id == article_id,
            ArticleTag.tag_id == tag_id
        ).first()
        
        if existing:
            return error_response(code=400, message="Tag already assigned to this article")
        
        # 创建关联
        article_tag = ArticleTag(
            id=str(uuid.uuid4()),
            article_id=article_id,
            tag_id=tag_id,
            created_at=datetime.now()
        )
        db.add(article_tag)
        db.commit()
        db.refresh(article_tag)
        
        return success_response(data={
            "article_id": article_id,
            "tag_id": tag_id,
            "tag_name": tag.name
        }, message="标签添加成功")
    except Exception as e:
        db.rollback()
        from core.print import print_error
        print_error(f"添加文章标签失败: {e}")
        return error_response(code=500, message=f"添加文章标签失败: {str(e)}")


@router.delete("/{tag_id}",
    summary="删除文章的标签关联",
    description="删除指定文章与标签的关联"
)
async def delete_article_tag(
    article_id: str,
    tag_id: str,
    db: Session = Depends(get_db),
    cur_user: dict = Depends(get_current_user)
):
    """
    删除文章的标签关联
    
    参数:
    - article_id: 文章ID
    - tag_id: 标签ID
    
    返回:
    - 成功响应
    """
    try:
        # 查找关联记录
        article_tag = db.query(ArticleTag).filter(
            ArticleTag.article_id == article_id,
            ArticleTag.tag_id == tag_id
        ).first()
        
        if not article_tag:
            return error_response(code=404, message="Article tag association not found")
        
        db.delete(article_tag)
        db.commit()
        
        return success_response(message="标签关联删除成功")
    except Exception as e:
        db.rollback()
        from core.print import print_error
        print_error(f"删除文章标签失败: {e}")
        return error_response(code=500, message=f"删除文章标签失败: {str(e)}")
