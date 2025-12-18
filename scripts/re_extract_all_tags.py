#!/usr/bin/env python3
"""
重新抽取所有文章的标签
功能：
1. 遍历所有文章（有内容的）
2. 删除每篇文章的旧标签关联（ArticleTag）
3. 重新提取标签并关联
4. 使用文章的发布日期作为标签日期

使用方法：
    python scripts/re_extract_all_tags.py
    python scripts/re_extract_all_tags.py --limit 100  # 只处理前100篇文章
    python scripts/re_extract_all_tags.py --mp-id xxx  # 只处理指定公众号的文章
    python scripts/re_extract_all_tags.py --dry-run     # 只查看，不实际修改
"""
import sys
import os
import argparse
from datetime import datetime
from typing import Optional

# 添加项目根目录到路径
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

# 在导入配置之前，先加载 .env 文件（如果存在）
env_path = os.path.join(project_root, '.env')
if os.path.exists(env_path):
    try:
        from dotenv import load_dotenv
        load_dotenv(env_path, override=False)  # 不覆盖已存在的环境变量
        
        # 如果 DB 环境变量未设置，尝试从 PostgreSQL 配置构建
        if not os.getenv("DB"):
            postgres_user = os.getenv("POSTGRES_USER", "deepling_user")
            postgres_password = os.getenv("POSTGRES_PASSWORD", "")
            postgres_db = os.getenv("POSTGRES_WERSS_DB") or os.getenv("POSTGRES_DB", "werss_db")
            postgres_host = os.getenv("POSTGRES_HOST", "localhost")
            postgres_port = os.getenv("POSTGRES_PORT", "5432")
            
            # 如果找到了 PostgreSQL 配置，构建连接字符串
            if postgres_password:
                db_url = f"postgresql://{postgres_user}:{postgres_password}@{postgres_host}:{postgres_port}/{postgres_db}"
                os.environ["DB"] = db_url
                print(f"✅ 已从 .env 文件构建 PostgreSQL 连接: postgresql://{postgres_user}:***@{postgres_host}:{postgres_port}/{postgres_db}")
    except ImportError:
        pass  # python-dotenv 未安装时忽略
    except Exception as e:
        print(f"⚠️  加载 .env 文件失败: {e}")

from core.db import DB
from core.models.article import Article
from core.models.article_tags import ArticleTag
from core.models.tags import Tags
from core.models.base import DATA_STATUS
from core.print import print_info, print_success, print_warning, print_error
from core.config import cfg
from sqlalchemy import func, or_


def re_extract_tags_for_article(session, article: Article, dry_run: bool = False) -> dict:
    """
    重新提取单篇文章的标签
    
    Args:
        session: 数据库会话
        article: 文章对象
        dry_run: 是否为试运行模式（不实际修改）
        
    Returns:
        dict: 包含处理结果的字典
    """
    result = {
        'article_id': article.id,
        'title': article.title[:50] if article.title else '无标题',
        'old_tags_count': 0,
        'new_tags_count': 0,
        'created_tags': [],
        'errors': []
    }
    
    try:
        # 1. 获取并删除旧的标签关联
        old_article_tags = session.query(ArticleTag).filter(
            ArticleTag.article_id == article.id
        ).all()
        
        result['old_tags_count'] = len(old_article_tags)
        
        if not dry_run:
            for old_tag in old_article_tags:
                session.delete(old_tag)
            session.flush()  # 立即提交删除操作
        
        # 2. 重新提取标签
        if not article.title:
            result['errors'].append("文章标题为空，跳过")
            return result
        
        # 获取文章内容
        content = article.content if hasattr(article, 'content') and article.content else ""
        description = article.description if article.description else ""
        
        # 调用标签提取方法
        # 注意：DB 是已经实例化的全局对象
        DB._assign_tags_by_extraction(
            session=session,
            article_id=article.id,
            title=article.title,
            description=description,
            content=content
        )
        
        # 3. 获取新创建的标签关联
        new_article_tags = session.query(ArticleTag).filter(
            ArticleTag.article_id == article.id
        ).all()
        
        result['new_tags_count'] = len(new_article_tags)
        
        # 获取新创建的标签名称
        if new_article_tags:
            tag_ids = [at.tag_id for at in new_article_tags]
            new_tags = session.query(Tags).filter(Tags.id.in_(tag_ids)).all()
            result['created_tags'] = [tag.name for tag in new_tags]
        
        if not dry_run:
            session.commit()
        else:
            session.rollback()  # 试运行模式，回滚所有更改
            
    except Exception as e:
        result['errors'].append(str(e))
        if not dry_run:
            session.rollback()
        print_error(f"处理文章 {article.id} 失败: {e}")
        import traceback
        traceback.print_exc()
    
    return result


def re_extract_all_tags(
    limit: Optional[int] = None,
    mp_id: Optional[str] = None,
    dry_run: bool = False,
    batch_size: int = 100
):
    """
    重新提取所有文章的标签
    
    Args:
        limit: 限制处理的文章数量（None 表示处理所有）
        mp_id: 只处理指定公众号的文章（None 表示处理所有）
        dry_run: 是否为试运行模式
        batch_size: 批处理大小（每批提交一次）
    """
    print_info("=" * 80)
    print_info("开始重新提取所有文章的标签")
    print_info("=" * 80)
    
    if dry_run:
        print_warning("⚠️  试运行模式：不会实际修改数据库")
    
    session = DB.get_session()
    
    try:
        # 调试：显示数据库连接信息
        # 注意：DB 是已经实例化的全局对象，不是类
        db_config = DB.connection_str if hasattr(DB, 'connection_str') else cfg.get("db", "") or ""
        print_info(f"📌 数据库连接: {db_config[:50]}..." if len(db_config) > 50 else f"📌 数据库连接: {db_config}")
        
        # 使用原生 SQL 查询，避免 ORM 问题
        from sqlalchemy import text
        try:
            sql_result = session.execute(text("SELECT COUNT(*) FROM articles"))
            sql_count = sql_result.scalar()
            print_info(f"📊 SQL 查询总文章数: {sql_count}")
        except Exception as e:
            print_warning(f"SQL 查询失败: {e}")
        
        # 调试：先查看数据库中的文章统计（使用 ORM）
        all_articles_count = session.query(Article).count()
        print_info(f"📊 ORM 查询总文章数: {all_articles_count}")
        
        # 尝试查询所有文章（不限制条件）
        all_articles = session.query(Article).limit(5).all()
        print_info(f"📊 查询到的文章示例数量: {len(all_articles)}")
        if all_articles:
            print_info(f"📄 示例文章: {all_articles[0].title[:50] if all_articles[0].title else '无标题'}")
            print_info(f"📄 示例文章状态: {all_articles[0].status}")
        
        # 检查各个条件
        # 注意：status 可能为 0 或 NULL，需要包含这些情况
        from sqlalchemy import or_
        not_deleted_count = session.query(Article).filter(
            or_(
                Article.status != DATA_STATUS.DELETED,
                Article.status.is_(None),
                Article.status == 0
            )
        ).count()
        print_info(f"📊 未删除文章数 (status != {DATA_STATUS.DELETED} 或 NULL 或 0): {not_deleted_count}")
        
        has_title_count = session.query(Article).filter(
            Article.title.isnot(None),
            Article.title != ''
        ).count()
        print_info(f"📊 有标题文章数: {has_title_count}")
        
        # 检查状态分布（使用原生 SQL，避免 ORM 问题）
        try:
            status_sql = "SELECT status, COUNT(*) as count FROM articles GROUP BY status"
            status_result = session.execute(text(status_sql))
            status_dist = dict(status_result.fetchall())
            print_info(f"📊 文章状态分布 (SQL): {status_dist}")
        except Exception as e:
            print_warning(f"SQL 状态分布查询失败: {e}")
            status_dist = {}
        
        # 尝试使用 ORM 查询状态分布
        try:
            status_dist_orm = session.query(Article.status, func.count(Article.id)).group_by(Article.status).all()
            print_info(f"📊 文章状态分布 (ORM): {dict(status_dist_orm)}")
        except Exception as e:
            print_warning(f"ORM 状态分布查询失败: {e}")
        
        # 构建查询 - 先不添加任何过滤条件，看看能查到多少
        print_info("\n🔍 测试查询条件...")
        query_all = session.query(Article)
        count_all = query_all.count()
        print_info(f"📊 无过滤条件查询: {count_all} 篇")
        
        # 逐步添加过滤条件
        # 注意：status 可能为 NULL 或 0，需要包含这些情况
        query_no_deleted = session.query(Article).filter(
            or_(
                Article.status != DATA_STATUS.DELETED,
                Article.status.is_(None),  # NULL 值也包含在内
                Article.status == 0  # status = 0 的文章也包含
            )
        )
        count_no_deleted = query_no_deleted.count()
        print_info(f"📊 排除已删除 (status != {DATA_STATUS.DELETED} 或 NULL 或 0): {count_no_deleted} 篇")
        
        query_has_title = session.query(Article).filter(
            Article.title.isnot(None),
            Article.title != ''
        )
        count_has_title = query_has_title.count()
        print_info(f"📊 有标题: {count_has_title} 篇")
        
        # 构建最终查询
        # 注意：status 为 NULL 或 0 的文章也应该处理（可能之前被重置了）
        query = session.query(Article).filter(
            or_(
                Article.status != DATA_STATUS.DELETED,
                Article.status.is_(None),  # NULL 值也包含在内
                Article.status == 0  # status = 0 的文章也包含
            ),
            Article.title.isnot(None),  # 必须有标题
            Article.title != ''  # 标题不能为空
        )
        
        # 如果指定了公众号ID，添加过滤条件
        if mp_id:
            query = query.filter(Article.mp_id == mp_id)
            print_info(f"📌 只处理公众号 ID: {mp_id} 的文章")
        
        # 先获取文章总数（在应用 limit 之前）
        total_count = query.count()
        print_info(f"📊 找到 {total_count} 篇文章需要处理")
        
        if total_count == 0:
            print_warning("⚠️  没有找到需要处理的文章")
            return
        
        # 按发布时间降序排列（必须在 limit 之前）
        query = query.order_by(Article.publish_time.desc())
        
        # 如果指定了限制数量（必须在 order_by 之后）
        if limit:
            query = query.limit(limit)
            print_info(f"📌 限制处理数量: {limit} 篇")
            # 更新实际处理数量
            total_count = min(limit, total_count)
        
        # 确认是否继续
        if not dry_run:
            response = input(f"\n是否继续处理 {total_count} 篇文章？(y/n): ")
            if response.lower() != 'y':
                print_info("已取消")
                return
        
        # 开始处理
        processed_count = 0
        success_count = 0
        error_count = 0
        total_old_tags = 0
        total_new_tags = 0
        created_tags_set = set()
        
        print_info("\n开始处理...")
        print_info("-" * 80)
        
        articles = query.all()
        
        for idx, article in enumerate(articles, 1):
            try:
                print_info(f"\n[{idx}/{total_count}] 处理文章: {article.title[:60] if article.title else '无标题'}")
                print_info(f"   文章ID: {article.id}")
                
                result = re_extract_tags_for_article(session, article, dry_run=dry_run)
                
                processed_count += 1
                
                if result['errors']:
                    error_count += 1
                    print_error(f"   ❌ 处理失败: {', '.join(result['errors'])}")
                else:
                    success_count += 1
                    total_old_tags += result['old_tags_count']
                    total_new_tags += result['new_tags_count']
                    created_tags_set.update(result['created_tags'])
                    
                    if result['old_tags_count'] > 0:
                        print_info(f"   🗑️  删除了 {result['old_tags_count']} 个旧标签关联")
                    if result['new_tags_count'] > 0:
                        print_success(f"   ✅ 创建了 {result['new_tags_count']} 个新标签关联")
                        if result['created_tags']:
                            print_info(f"   📌 标签: {', '.join(result['created_tags'][:5])}")
                            if len(result['created_tags']) > 5:
                                print_info(f"   ... 还有 {len(result['created_tags']) - 5} 个标签")
                    else:
                        print_warning(f"   ⚠️  未提取到任何标签")
                
                # 每处理 batch_size 篇文章，显示一次进度
                if idx % batch_size == 0:
                    print_info(f"\n📊 进度: {idx}/{total_count} ({idx*100//total_count}%)")
                    print_info(f"   成功: {success_count}, 失败: {error_count}")
                    if not dry_run:
                        session.commit()  # 批量提交
                        print_info(f"   ✅ 已提交前 {idx} 篇文章的更改")
                
            except KeyboardInterrupt:
                print_warning("\n\n⚠️  用户中断操作")
                if not dry_run:
                    session.rollback()
                break
            except Exception as e:
                error_count += 1
                processed_count += 1
                print_error(f"处理文章 {article.id} 时发生异常: {e}")
                if not dry_run:
                    session.rollback()
                import traceback
                traceback.print_exc()
        
        # 最终提交
        if not dry_run and processed_count > 0:
            session.commit()
            print_info(f"\n✅ 已提交所有更改")
        
        # 显示统计信息
        print_info("\n" + "=" * 80)
        print_info("处理完成统计")
        print_info("=" * 80)
        print_info(f"📊 总文章数: {total_count}")
        print_info(f"✅ 成功处理: {success_count}")
        print_info(f"❌ 处理失败: {error_count}")
        print_info(f"🗑️  删除的旧标签关联: {total_old_tags}")
        print_info(f"✨ 创建的新标签关联: {total_new_tags}")
        print_info(f"📌 创建的标签总数: {len(created_tags_set)}")
        if created_tags_set:
            print_info(f"📌 标签列表（前20个）: {', '.join(list(created_tags_set)[:20])}")
            if len(created_tags_set) > 20:
                print_info(f"   ... 还有 {len(created_tags_set) - 20} 个标签")
        
    except Exception as e:
        print_error(f"处理过程中发生错误: {e}")
        import traceback
        traceback.print_exc()
        if not dry_run:
            session.rollback()
    finally:
        session.close()


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="重新抽取所有文章的标签")
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="限制处理的文章数量（默认：处理所有）"
    )
    parser.add_argument(
        "--mp-id",
        type=str,
        default=None,
        help="只处理指定公众号ID的文章（默认：处理所有）"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="试运行模式：只查看，不实际修改数据库"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="批处理大小（每批提交一次，默认：100）"
    )
    
    args = parser.parse_args()
    
    # 显示配置信息
    extract_method = cfg.get("article_tag.extract_method", "textrank")
    max_tags = cfg.get("article_tag.max_topics", 5)
    auto_extract = cfg.get("article_tag.auto_extract", False)
    
    # 显示数据库连接信息
    # 注意：DB 是已经实例化的全局对象，不是类
    db_config = DB.connection_str if hasattr(DB, 'connection_str') else cfg.get("db", "") or ""
    # 隐藏密码
    if "@" in db_config:
        import re
        db_config_display = re.sub(r':([^:@]+)@', ':***@', db_config)
    else:
        db_config_display = db_config
    
    print_info("=" * 80)
    print_info("标签重新提取脚本")
    print_info("=" * 80)
    print_info(f"📌 数据库: {db_config_display}")
    print_info(f"📌 提取方式: {extract_method}")
    print_info(f"📌 最大标签数: {max_tags}")
    print_info(f"📌 自动提取: {auto_extract}")
    print_info("=" * 80)
    
    if not auto_extract:
        print_warning("⚠️  注意：配置中 auto_extract 为 False，但脚本会强制提取标签")
    
    # 执行重新提取
    re_extract_all_tags(
        limit=args.limit,
        mp_id=args.mp_id,
        dry_run=args.dry_run,
        batch_size=args.batch_size
    )


if __name__ == "__main__":
    main()
