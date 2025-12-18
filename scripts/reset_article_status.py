#!/usr/bin/env python3
"""
重置文章状态脚本
功能：
1. 查看前100篇文章
2. 将所有文章的 status 置为 0

使用方法：
    python scripts/reset_article_status.py --view          # 查看前100篇文章
    python scripts/reset_article_status.py                 # 将所有文章状态置为0
    python scripts/reset_article_status.py --dry-run       # 只查看，不修改
    python scripts/reset_article_status.py --limit 1000    # 只更新前1000篇
"""
import sys
import os
import argparse
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
from core.print import print_info, print_success, print_warning, print_error
from core.config import cfg
from sqlalchemy import text


def view_articles(limit: int = 100):
    """查看前N篇文章"""
    session = DB.get_session()
    try:
        print_info("=" * 80)
        print_info(f"查看前 {limit} 篇文章")
        print_info("=" * 80)
        
        # 使用原生 SQL 查询
        sql = f"SELECT * FROM articles LIMIT {limit}"
        result = session.execute(text(sql))
        
        articles = result.fetchall()
        columns = result.keys()
        
        print_info(f"\n找到 {len(articles)} 篇文章：\n")
        
        # 显示表头
        header = " | ".join([str(col) for col in columns])
        print_info(header)
        print_info("-" * min(len(header), 120))
        
        # 显示前10条数据（避免输出太多）
        for idx, article in enumerate(articles[:10], 1):
            row = " | ".join([str(val)[:30] if val else "NULL" for val in article])
            print_info(row)
        
        if len(articles) > 10:
            print_info(f"... 还有 {len(articles) - 10} 篇文章")
        
        # 统计状态分布
        status_sql = "SELECT status, COUNT(*) as count FROM articles GROUP BY status"
        status_result = session.execute(text(status_sql))
        status_dist = dict(status_result.fetchall())
        
        print_info(f"\n📊 文章状态分布:")
        for status, count in sorted(status_dist.items()):
            print_info(f"   status={status}: {count} 篇")
        
        return articles
        
    except Exception as e:
        print_error(f"查询文章失败: {e}")
        import traceback
        traceback.print_exc()
        return []
    finally:
        session.close()


def reset_all_article_status(dry_run: bool = False, limit: Optional[int] = None):
    """
    将所有文章的 status 置为 0
    
    Args:
        dry_run: 是否为试运行模式（不实际修改）
        limit: 限制更新的文章数量（None 表示更新所有）
    """
    session = DB.get_session()
    
    try:
        print_info("=" * 80)
        print_info("重置所有文章状态为 0")
        print_info("=" * 80)
        
        if dry_run:
            print_warning("⚠️  试运行模式：不会实际修改数据库")
        
        # 先查看当前状态分布
        status_sql = "SELECT status, COUNT(*) as count FROM articles GROUP BY status"
        status_result = session.execute(text(status_sql))
        status_dist_before = dict(status_result.fetchall())
        
        print_info(f"\n📊 更新前的状态分布:")
        for status, count in sorted(status_dist_before.items()):
            print_info(f"   status={status}: {count} 篇")
        
        # 构建更新 SQL
        # 注意：不同数据库的 UPDATE LIMIT 语法不同
        # MySQL: UPDATE ... LIMIT n
        # PostgreSQL: UPDATE ... WHERE id IN (SELECT id FROM ... LIMIT n)
        # SQLite: UPDATE ... LIMIT n (但 SQLite 不支持，需要使用其他方法)
        # 注意：DB 是已经实例化的全局对象，不是类
        db_config = DB.connection_str if hasattr(DB, 'connection_str') else cfg.get("db", "") or ""
        
        if limit:
            if "postgresql" in db_config.lower() or "postgres" in db_config.lower():
                # PostgreSQL 语法
                update_sql = f"""
                    UPDATE articles 
                    SET status = 0 
                    WHERE id IN (
                        SELECT id FROM articles LIMIT {limit}
                    )
                """
            elif "sqlite" in db_config.lower():
                # SQLite 不支持 UPDATE LIMIT，使用 CTID 或 ROWID（但 articles 表可能没有）
                # 改用分批更新的方式
                update_sql = f"""
                    UPDATE articles 
                    SET status = 0 
                    WHERE id IN (
                        SELECT id FROM articles LIMIT {limit}
                    )
                """
            else:
                # MySQL 语法
                update_sql = f"UPDATE articles SET status = 0 LIMIT {limit}"
            print_info(f"\n📌 将更新前 {limit} 篇文章的状态为 0")
        else:
            update_sql = "UPDATE articles SET status = 0"
            print_info(f"\n📌 将更新所有文章的状态为 0")
        
        # 获取要更新的文章数量
        if limit:
            count_sql = f"SELECT COUNT(*) FROM articles LIMIT {limit}"
        else:
            count_sql = "SELECT COUNT(*) FROM articles"
        
        count_result = session.execute(text(count_sql))
        total_count = count_result.scalar()
        
        print_info(f"📊 将更新 {total_count} 篇文章")
        
        if not dry_run:
            # 确认是否继续
            response = input(f"\n是否继续？(y/n): ")
            if response.lower() != 'y':
                print_info("已取消")
                return
            
            # 执行更新
            print_info("\n开始更新...")
            result = session.execute(text(update_sql))
            session.commit()
            
            affected_rows = result.rowcount
            print_success(f"✅ 成功更新 {affected_rows} 篇文章的状态为 0")
            
            # 查看更新后的状态分布
            status_result_after = session.execute(text(status_sql))
            status_dist_after = dict(status_result_after.fetchall())
            
            print_info(f"\n📊 更新后的状态分布:")
            for status, count in sorted(status_dist_after.items()):
                print_info(f"   status={status}: {count} 篇")
        else:
            print_info("\n⚠️  试运行模式：未实际执行更新")
            print_info(f"   将执行的 SQL: {update_sql}")
        
    except Exception as e:
        print_error(f"更新文章状态失败: {e}")
        import traceback
        traceback.print_exc()
        if not dry_run:
            session.rollback()
    finally:
        session.close()


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="重置文章状态脚本")
    parser.add_argument(
        "--view",
        action="store_true",
        help="查看前100篇文章（不修改）"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="限制更新的文章数量（默认：更新所有）"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="试运行模式：只查看，不实际修改数据库"
    )
    
    args = parser.parse_args()
    
    if args.view:
        # 只查看文章
        view_articles(limit=100)
    else:
        # 重置状态
        reset_all_article_status(
            dry_run=args.dry_run,
            limit=args.limit
        )


if __name__ == "__main__":
    main()
