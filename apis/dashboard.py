from fastapi import APIRouter, Depends, HTTPException, status as fast_status
from core.auth import get_current_user
from core.db import DB
from core.models.base import DATA_STATUS
from core.models.article import Article, ArticleBase
from core.models.feed import Feed
from sqlalchemy import func, and_, case
from datetime import datetime, timedelta
from .base import success_response, error_response
from typing import Dict, Any, List

router = APIRouter(prefix="/dashboard", tags=["Dashboard统计"])


@router.get("/stats", summary="获取Dashboard统计数据")
async def get_dashboard_stats(
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """获取Dashboard统计数据，包括：
    - 总文章数、来源数量、今日新增、本周新增
    - 来源分布统计
    - 热门关键词统计
    - 关键词趋势数据
    - 抓取趋势数据
    """
    session = DB.get_session()
    try:
        now = datetime.now()
        today_start = datetime(now.year, now.month, now.day)
        week_start = now - timedelta(days=7)
        thirty_days_ago = now - timedelta(days=30)

        # 1. 基础统计
        # 总文章数（排除已删除）
        total_articles = session.query(ArticleBase).filter(
            ArticleBase.status != DATA_STATUS.DELETED
        ).count()

        # 总来源数
        total_sources = session.query(Feed).count()

        # 今日新增文章
        today_articles = session.query(ArticleBase).filter(
            and_(
                ArticleBase.status != DATA_STATUS.DELETED,
                ArticleBase.created_at >= today_start
            )
        ).count()

        # 本周新增文章
        week_articles = session.query(ArticleBase).filter(
            and_(
                ArticleBase.status != DATA_STATUS.DELETED,
                ArticleBase.created_at >= week_start
            )
        ).count()

        # 2. 来源分布统计
        source_stats_query = session.query(
            Feed.id,
            Feed.mp_name,
            func.count(
                case((Article.status != DATA_STATUS.DELETED, Article.id), else_=None)
            ).label('article_count')
        ).outerjoin(
            Article, Feed.id == Article.mp_id
        ).group_by(
            Feed.id, Feed.mp_name
        ).order_by(
            func.count(
                case((Article.status != DATA_STATUS.DELETED, Article.id), else_=None)
            ).desc()
        ).limit(10).all()

        source_stats = [
            {
                "mp_id": str(item.id),
                "mp_name": item.mp_name or "未知来源",
                "article_count": item.article_count or 0,
                "percentage": round((item.article_count or 0) / total_articles * 100, 2) if total_articles > 0 else 0
            }
            for item in source_stats_query
        ]

        # 3. 热门关键词统计（从文章的 tags 中获取，而不是从标题拆分）
        from core.models.article_tags import ArticleTag
        from core.models.tags import Tags as TagsModel
        
        # 获取最近30天的文章及其标签
        recent_articles_with_tags = session.query(
            Article.id,
            Article.created_at,
            TagsModel.name.label('tag_name')
        ).join(
            ArticleTag, Article.id == ArticleTag.article_id
        ).join(
            TagsModel, ArticleTag.tag_id == TagsModel.id
        ).filter(
            and_(
                Article.status != DATA_STATUS.DELETED,
                Article.created_at >= thirty_days_ago,
                TagsModel.status == 1  # 只统计启用的标签
            )
        ).all()

        keyword_map = {}
        keyword_trend_map = {}  # keyword -> date -> count

        # 过滤无效关键词的正则表达式
        import re
        invalid_keyword_pattern = re.compile(r'^[a-z]{1,2}$|^[0-9]+$|^[^\u4e00-\u9fa5a-zA-Z0-9]+$|^\.+$')

        for row in recent_articles_with_tags:
            tag_name = row.tag_name
            if not tag_name or not tag_name.strip():
                continue
            
            keyword = tag_name.strip()
            # 过滤无效关键词：
            # 1. 长度至少2个字符
            # 2. 不是单个或两个小写字母（如 "pe", "en"）
            # 3. 不是纯数字
            # 4. 不是纯标点符号
            # 5. 不是只有点号
            # 6. 长度不超过20个字符
            if (
                len(keyword) < 2 or 
                len(keyword) > 20 or
                invalid_keyword_pattern.match(keyword)
            ):
                continue
            
            created = row.created_at
            date_key = created.date().isoformat() if created else None

            # 统计关键词
            keyword_map[keyword] = keyword_map.get(keyword, 0) + 1

            # 记录关键词趋势
            if keyword not in keyword_trend_map:
                keyword_trend_map[keyword] = {}
            if date_key:
                keyword_trend_map[keyword][date_key] = keyword_trend_map[keyword].get(date_key, 0) + 1

        # 排序并取前20个
        keyword_stats = sorted(
            [{"keyword": k, "count": v} for k, v in keyword_map.items()],
            key=lambda x: x["count"],
            reverse=True
        )[:20]

        # 4. 关键词趋势数据（前10个关键词，最近30天）
        top_keywords = [item["keyword"] for item in keyword_stats[:10]]
        
        # 生成日期范围
        date_range = []
        for i in range(30):
            date = (now - timedelta(days=29 - i)).date()
            date_range.append(date.isoformat())

        keyword_trend_data = []
        for date in date_range:
            keywords = {}
            for keyword in top_keywords:
                keywords[keyword] = keyword_trend_map.get(keyword, {}).get(date, 0)
            keyword_trend_data.append({
                "date": date,
                "keywords": keywords
            })

        # 5. 抓取趋势数据（最近30天，按公众号分组，使用文章发布时间）
        # 计算30天前的时间戳（秒级）
        thirty_days_ago_timestamp = int((now - timedelta(days=30)).timestamp())
        
        # 查询所有符合条件的文章（使用发布时间）
        trend_query = session.query(
            Article.publish_time,
            Feed.mp_name,
            Article.id
        ).outerjoin(
            Feed, Article.mp_id == Feed.id
        ).filter(
            and_(
                Article.status != DATA_STATUS.DELETED,
                Article.publish_time >= thirty_days_ago_timestamp
            )
        ).all()

        # 在 Python 层面按日期和公众号分组统计
        trend_map: Dict[str, Dict[str, int]] = {}
        for item in trend_query:
            # 将时间戳转换为日期
            try:
                # publish_time 是秒级时间戳
                publish_timestamp = item.publish_time
                if publish_timestamp and publish_timestamp > 0:
                    publish_date = datetime.fromtimestamp(publish_timestamp)
                    date_key = publish_date.date().isoformat()
                    mp_name = item.mp_name or "未知来源"
                    
                    if date_key not in trend_map:
                        trend_map[date_key] = {}
                    if mp_name not in trend_map[date_key]:
                        trend_map[date_key][mp_name] = 0
                    trend_map[date_key][mp_name] += 1
            except (ValueError, TypeError, OSError) as e:
                # 时间戳转换失败，跳过这条记录
                continue

        # 获取所有出现过的公众号名称
        all_mp_names = set()
        for sources in trend_map.values():
            all_mp_names.update(sources.keys())

        # 生成趋势数据，每个日期包含所有公众号的统计
        trend_data = []
        for date in date_range:
            sources = trend_map.get(date, {})
            # 确保所有公众号都在数据中，即使某天没有文章也显示为0
            sources_dict = {mp_name: sources.get(mp_name, 0) for mp_name in all_mp_names}
            trend_data.append({
                "date": date,
                "sources": sources_dict
            })

        return success_response({
            "stats": {
                "totalArticles": total_articles,
                "totalSources": total_sources,
                "todayArticles": today_articles,
                "weekArticles": week_articles
            },
            "sourceStats": source_stats,
            "keywordStats": keyword_stats,
            "keywordTrendData": keyword_trend_data,
            "trendData": trend_data
        })

    except Exception as e:
        session.rollback()
        raise HTTPException(
            status_code=fast_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=error_response(
                code=50001,
                message=f"获取统计数据失败: {str(e)}"
            )
        )
    finally:
        session.close()

