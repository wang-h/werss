from fastapi import APIRouter, Depends, HTTPException, status as fast_status, Query
from core.auth import get_current_user
from core.db import DB
from core.models.base import DATA_STATUS
from core.models.article import Article,ArticleBase
from sqlalchemy import and_, or_, desc
from .base import success_response, error_response
from core.config import cfg
from apis.base import format_search_kw
from core.print import print_warning, print_info, print_error, print_success
router = APIRouter(prefix=f"/articles", tags=["文章管理"])


    
@router.delete("/clean", summary="清理无效文章(MP_ID不存在于Feeds表中的文章)")
async def clean_orphan_articles(
    current_user: dict = Depends(get_current_user)
):
    session = DB.get_session()
    try:
        from core.models.feed import Feed
        from core.models.article import Article
        
        # 找出Articles表中mp_id不在Feeds表中的记录
        subquery = session.query(Feed.id).subquery()
        deleted_count = session.query(Article)\
            .filter(~Article.mp_id.in_(subquery))\
            .delete(synchronize_session=False)
        
        session.commit()
        
        return success_response({
            "message": "清理无效文章成功",
            "deleted_count": deleted_count
        })
    except Exception as e:
        session.rollback()
        print(f"清理无效文章错误: {str(e)}")
        raise HTTPException(
            status_code=fast_status.HTTP_201_CREATED,
            detail=error_response(
                code=50001,
                message="清理无效文章失败"
            )
        )
    
@router.delete("/clean_duplicate_articles", summary="清理重复文章")
async def clean_duplicate(
    current_user: dict = Depends(get_current_user)
):
    try:
        from tools.clean import clean_duplicate_articles
        (msg, deleted_count) =clean_duplicate_articles()
        return success_response({
            "message": msg,
            "deleted_count": deleted_count
        })
    except Exception as e:
        print(f"清理重复文章: {str(e)}")
        raise HTTPException(
            status_code=fast_status.HTTP_201_CREATED,
            detail=error_response(
                code=50001,
                message="清理重复文章"
            )
        )


@router.api_route("", summary="获取文章列表",methods= ["GET", "POST"], operation_id="get_articles_list")
async def get_articles(
    offset: int = Query(0, ge=0),
    limit: int = Query(5, ge=1, le=100),
    status: str = Query(None),
    search: str = Query(None),
    mp_id: str = Query(None),
    has_content:bool=Query(False),
    current_user: dict = Depends(get_current_user)
):
    session = DB.get_session()
    try:
      
        
        # 构建查询条件
        # 统一使用 ArticleBase 进行查询（包含 status 字段）
        query = session.query(ArticleBase)
        if has_content:
            query = session.query(Article)
        
        # 默认过滤已删除的文章（除非明确指定 status 参数）
        if status:
            # 如果指定了 status，按指定状态过滤（包括已删除状态）
            query = query.filter(ArticleBase.status == int(status))
        else:
            # 默认不显示已删除的文章
            query = query.filter(ArticleBase.status != DATA_STATUS.DELETED)
        if mp_id:
            query = query.filter(ArticleBase.mp_id == mp_id)
        if search:
            # format_search_kw 使用 Article 模型，但 Article 继承自 ArticleBase，共享同一张表
            # 所以可以直接使用
            query = query.filter(
               format_search_kw(search)
            )
        
        # 获取总数
        total = query.count()
        query= query.order_by(ArticleBase.publish_time.desc()).offset(offset).limit(limit)
        # query= query.order_by(Article.id.desc()).offset(offset).limit(limit)
        # 分页查询（按发布时间降序）
        articles = query.all()
        
        # 打印生成的 SQL 语句（包含分页参数）
        print_warning(query.statement.compile(compile_kwargs={"literal_binds": True}))
                       
        # 查询公众号名称
        from core.models.feed import Feed
        mp_names = {}
        for article in articles:
            if article.mp_id and article.mp_id not in mp_names:
                feed = session.query(Feed).filter(Feed.id == article.mp_id).first()
                mp_names[article.mp_id] = feed.mp_name if feed else "未知公众号"
        
        # 合并公众号名称和标签到文章列表
        from core.models.article_tags import ArticleTag
        from core.models.tags import Tags as TagsModel
        
        article_list = []
        for article in articles:
            article_dict = article.__dict__
            article_dict["mp_name"] = mp_names.get(article.mp_id, "未知公众号")
            
            # 获取文章的标签（通过 article_tags 关联到 tags 表）
            article_tags = session.query(ArticleTag).filter(
                ArticleTag.article_id == article.id
            ).all()
            tag_ids = [at.tag_id for at in article_tags]
            tags = session.query(TagsModel).filter(TagsModel.id.in_(tag_ids)).all() if tag_ids else []
            article_dict["tags"] = [{"id": t.id, "name": t.name} for t in tags]
            article_dict["tag_names"] = [t.name for t in tags]  # 用于显示
            # topics 应该独立于 tags，不应该被 tag 覆盖
            article_dict["topics"] = []
            article_dict["topic_names"] = []
            
            article_list.append(article_dict)
        
        from .base import success_response
        return success_response({
            "list": article_list,
            "total": total
        })
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(
            status_code=fast_status.HTTP_406_NOT_ACCEPTABLE,
            detail=error_response(
                code=50001,
                message=f"获取文章列表失败: {str(e)}"
            )
        )

@router.get("/{article_id}", summary="获取文章详情")
async def get_article_detail(
    article_id: str,
    content: bool = False,
    # current_user: dict = Depends(get_current_user)
):
    session = DB.get_session()
    try:
        article = session.query(Article).filter(Article.id==article_id).filter(Article.status != DATA_STATUS.DELETED).first()
        if not article:
            from .base import error_response
            raise HTTPException(
                status_code=fast_status.HTTP_404_NOT_FOUND,
                detail=error_response(
                    code=40401,
                    message="文章不存在"
                )
            )
        
        # 转换为字典并添加额外信息
        article_dict = article.__dict__.copy()
        
        # 查询公众号名称
        from core.models.feed import Feed
        if article.mp_id:
            feed = session.query(Feed).filter(Feed.id == article.mp_id).first()
            article_dict["mp_name"] = feed.mp_name if feed else "未知公众号"
        
        # 获取文章的标签
        from core.models.article_tags import ArticleTag
        from core.models.tags import Tags as TagsModel
        article_tags = session.query(ArticleTag).filter(
            ArticleTag.article_id == article.id
        ).all()
        tag_ids = [at.tag_id for at in article_tags]
        tags = session.query(TagsModel).filter(TagsModel.id.in_(tag_ids)).all() if tag_ids else []
        article_dict["tags"] = [{"id": t.id, "name": t.name} for t in tags]
        article_dict["tag_names"] = [t.name for t in tags]
        # topics 应该独立于 tags，不应该被 tag 覆盖
        article_dict["topics"] = []
        article_dict["topic_names"] = []
        
        return success_response(article_dict)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(
            status_code=fast_status.HTTP_406_NOT_ACCEPTABLE,
            detail=error_response(
                code=50001,
                message=f"获取文章详情失败: {str(e)}"
            )
        )   

@router.delete("/{article_id}", summary="删除文章")
async def delete_article(
    article_id: str,
    current_user: dict = Depends(get_current_user)
):
    session = DB.get_session()
    try:
        from core.models.article import Article
        
        # 检查文章是否存在
        article = session.query(Article).filter(Article.id == article_id).first()
        if not article:
            raise HTTPException(
                status_code=fast_status.HTTP_406_NOT_ACCEPTABLE,
                detail=error_response(
                    code=40401,
                    message="文章不存在"
                )
            )
        # 根据配置决定是逻辑删除还是物理删除
        # 默认使用物理删除（真正从数据库删除），如果需要逻辑删除，可在配置文件中设置 article.true_delete: False
        true_delete = cfg.get("article.true_delete", True)
        if true_delete:
            # 物理删除（真正从数据库删除）
            session.delete(article)
            message = "文章已删除"
        else:
            # 逻辑删除（更新状态为deleted，保留数据）
            article.status = DATA_STATUS.DELETED
            message = "文章已标记为删除"
        
        session.commit()
        
        return success_response(None, message=message)
    except Exception as e:
        session.rollback()
        raise HTTPException(
            status_code=fast_status.HTTP_406_NOT_ACCEPTABLE,
            detail=error_response(
                code=50001,
                message=f"删除文章失败: {str(e)}"
            )
        )

@router.get("/{article_id}/next", summary="获取下一篇文章")
async def get_next_article(
    article_id: str,
    current_user: dict = Depends(get_current_user)
):
    session = DB.get_session()
    try:
        # 获取当前文章的发布时间
        current_article = session.query(Article).filter(Article.id == article_id).first()
        if not current_article:
            raise HTTPException(
                status_code=fast_status.HTTP_404_NOT_FOUND,
                detail=error_response(
                    code=40401,
                    message="当前文章不存在"
                )
            )
        
        # 查询发布时间更晚的第一篇文章
        next_article = session.query(Article)\
            .filter(Article.publish_time > current_article.publish_time)\
            .filter(Article.status != DATA_STATUS.DELETED)\
            .filter(Article.mp_id == current_article.mp_id)\
            .order_by(Article.publish_time.asc())\
            .first()
        
        if not next_article:
            raise HTTPException(
                status_code=fast_status.HTTP_406_NOT_ACCEPTABLE,
                detail=error_response(
                    code=40402,
                    message="没有下一篇文章"
                )
            )
        
        return success_response(next_article)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(
            status_code=fast_status.HTTP_406_NOT_ACCEPTABLE,
            detail=error_response(
                code=50001,
                message=f"获取下一篇文章失败: {str(e)}"
            )
        )

@router.get("/{article_id}/prev", summary="获取上一篇文章")
async def get_prev_article(
    article_id: str,
    current_user: dict = Depends(get_current_user)
):
    session = DB.get_session()
    try:
        # 获取当前文章的发布时间
        current_article = session.query(Article).filter(Article.id == article_id).first()
        if not current_article:
            raise HTTPException(
                status_code=fast_status.HTTP_404_NOT_FOUND,
                detail=error_response(
                    code=40401,
                    message="当前文章不存在"
                )
            )
        
        # 查询发布时间更早的第一篇文章
        prev_article = session.query(Article)\
            .filter(Article.publish_time < current_article.publish_time)\
            .filter(Article.status != DATA_STATUS.DELETED)\
            .filter(Article.mp_id == current_article.mp_id)\
            .order_by(Article.publish_time.desc())\
            .first()
        
        if not prev_article:
            raise HTTPException(
                status_code=fast_status.HTTP_406_NOT_ACCEPTABLE,
                detail=error_response(
                    code=40403,
                    message="没有上一篇文章"
                )
            )
        
        return success_response(prev_article)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(
            status_code=fast_status.HTTP_406_NOT_ACCEPTABLE,
            detail=error_response(
                code=50001,
                message=f"获取上一篇文章失败: {str(e)}"
            )
        )

@router.post("/{article_id}/fetch_content", summary="重新获取文章内容")
async def fetch_article_content(
    article_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    重新获取文章内容
    如果文章内容为空或需要更新，可以调用此接口重新获取
    """
    session = DB.get_session()
    try:
        # 查询文章
        article = session.query(Article).filter(Article.id == article_id).first()
        if not article:
            raise HTTPException(
                status_code=fast_status.HTTP_404_NOT_FOUND,
                detail=error_response(
                    code=40401,
                    message="文章不存在"
                )
            )
        
        # 构建URL
        if article.url:
            url = article.url
        else:
            url = f"https://mp.weixin.qq.com/s/{article.id}"
        
        print_info(f"正在重新获取文章内容: {article.title}, URL: {url}")
        
        # 根据配置选择获取方式
        from core.wx.base import WxGather
        from driver.wxarticle import Web
        import random
        import time
        
        content = None
        if cfg.get("gather.content_mode", "web") == "web":
            # 使用 Web 模式（Playwright）
            try:
                result = Web.get_article_content(url)
                content = result.get("content") if result else None
            except Exception as e:
                print_error(f"Web模式获取内容失败: {e}")
        else:
            # 使用 API 模式
            try:
                ga = WxGather().Model()
                content = ga.content_extract(url)
            except Exception as e:
                print_error(f"API模式获取内容失败: {e}")
        
        if content:
            # 检查内容是否被删除
            if content == "DELETED":
                article.status = DATA_STATUS.DELETED
                session.commit()
                raise HTTPException(
                    status_code=fast_status.HTTP_406_NOT_ACCEPTABLE,
                    detail=error_response(
                        code=40404,
                        message="文章内容已被发布者删除"
                    )
                )
            
            # 更新内容
            article.content = content
            session.commit()
            print_success(f"成功更新文章 {article.title} 的内容")
            
            return success_response({
                "message": "内容获取成功",
                "content_length": len(content)
            })
        else:
            raise HTTPException(
                status_code=fast_status.HTTP_406_NOT_ACCEPTABLE,
                detail=error_response(
                    code=50002,
                    message="获取文章内容失败，请稍后重试"
                )
            )
            
    except HTTPException as e:
        raise e
    except Exception as e:
        session.rollback()
        print_error(f"重新获取文章内容失败: {str(e)}")
        raise HTTPException(
            status_code=fast_status.HTTP_406_NOT_ACCEPTABLE,
            detail=error_response(
                code=50001,
                message=f"重新获取文章内容失败: {str(e)}"
            )
        )
    finally:
        session.close()