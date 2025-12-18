from sqlalchemy import create_engine, Engine,Text,event,inspect,text
from sqlalchemy.orm import sessionmaker, declarative_base,scoped_session
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.exc import SQLAlchemyError
from typing import Optional, List
from .models import Feed, Article
from .config import cfg
from core.models.base import Base  
from core.print import print_warning,print_info,print_error,print_success
import logging
import os

# SQLAlchemy 日志级别将在 init 方法中根据配置文件的 debug 设置来动态配置

# 声明基类
# Base = declarative_base()

class Db:
    connection_str: str=None
    def __init__(self,tag:str="默认",User_In_Thread=True):
        self.Session= None
        self.engine = None
        self.User_In_Thread=User_In_Thread
        self.tag=tag
        print_success(f"[{tag}]连接初始化")
        # 获取数据库连接字符串，如果为 None 则使用默认值
        db_config = cfg.get("db") or "sqlite:///data/db.db"
        self.init(db_config)
    def get_engine(self) -> Engine:
        """Return the SQLAlchemy engine for this database connection."""
        if self.engine is None:
            raise ValueError("Database connection has not been initialized.")
        return self.engine
    def get_session_factory(self):
        return sessionmaker(bind=self.engine, autoflush=True, expire_on_commit=True, future=True)
    def init(self, con_str: str) -> None:
        """Initialize database connection and create tables"""
        try:
            if con_str is None:
                raise ValueError("Database connection string is None. Please configure 'db' in config.yaml or set DB environment variable.")
            self.connection_str=con_str
            # 检查SQLite数据库文件是否存在
            if con_str.startswith('sqlite:///'):
                db_path = con_str[10:]  # 去掉'sqlite:///'前缀
                if not os.path.exists(db_path):
                    try:
                        os.makedirs(os.path.dirname(db_path), exist_ok=True)
                    except Exception as e:
                        pass
                    open(db_path, 'w').close()
            # 根据配置文件的 debug 设置决定是否启用 SQL 日志
            # 开发环境（debug=True）：显示 SQL 日志（INFO 级别）
            # 部署环境（debug=False）：不显示 SQL 日志（WARNING 级别）
            debug_mode = cfg.get("debug", False)
            db_echo_env = os.getenv("DB_ECHO", "").lower() == "true"
            # 如果环境变量 DB_ECHO 明确设置为 true，则启用；否则根据 debug 配置决定
            echo_sql = db_echo_env or debug_mode
            
            # 配置 SQLAlchemy 日志级别
            if echo_sql:
                # 开发环境：启用 INFO 级别的 SQL 日志
                logging.getLogger('sqlalchemy.engine').setLevel(logging.INFO)
                logging.getLogger('sqlalchemy.pool').setLevel(logging.INFO)
                logging.getLogger('sqlalchemy.dialects').setLevel(logging.INFO)
            else:
                # 部署环境：禁用 SQL 日志（只显示 WARNING 及以上级别）
                logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)
                logging.getLogger('sqlalchemy.pool').setLevel(logging.WARNING)
                logging.getLogger('sqlalchemy.dialects').setLevel(logging.WARNING)
            
            self.engine = create_engine(con_str,
                                     pool_size=2,          # 最小空闲连接数
                                     max_overflow=20,      # 允许的最大溢出连接数
                                     pool_timeout=30,      # 获取连接时的超时时间（秒）
                                     echo=echo_sql,        # 根据配置文件的 debug 设置控制 SQL 日志
                                     pool_recycle=60,  # 连接池回收时间（秒）
                                     isolation_level="AUTOCOMMIT",  # 设置隔离级别
                                    #  isolation_level="READ COMMITTED",  # 设置隔离级别
                                    #  query_cache_size=0,
                                     connect_args={"check_same_thread": False} if con_str.startswith('sqlite:///') else {}
                                     )
            self.session_factory=self.get_session_factory()
            
            # 自动执行数据库迁移（检测并添加缺失的字段）
            try:
                self.migrate_tables()
            except Exception as e:
                print_warning(f"自动迁移执行失败（不影响启动）: {e}")
        except Exception as e:
            print(f"Error creating database connection: {e}")
            raise
    def create_tables(self):
        """Create all tables defined in models"""
        from core.models.base import Base as B # 导入所有模型
        try:
            B.metadata.create_all(self.engine)
            print_success('所有表创建成功！')
        except Exception as e:
            print_error(f"创建表失败: {e}")
    
    def migrate_tables(self):
        """
        自动迁移数据库表结构
        检测模型定义与数据库表结构的差异，自动添加缺失的字段
        """
        from core.models.base import Base as B
        from sqlalchemy import inspect as sql_inspect
        
        try:
            inspector = sql_inspect(self.engine)
            
            # 遍历所有模型
            for table_name, table in B.metadata.tables.items():
                if not inspector.has_table(table_name):
                    # 表不存在，创建表
                    print_info(f"📦 创建新表: {table_name}")
                    table.create(self.engine, checkfirst=True)
                else:
                    # 表存在，检查字段差异
                    existing_columns = {col['name']: col for col in inspector.get_columns(table_name)}
                    model_columns = {col.name: col for col in table.columns}
                    
                    # 检查缺失的字段
                    for col_name, model_col in model_columns.items():
                        if col_name not in existing_columns:
                            # 字段不存在，添加字段
                            self._add_column(table_name, col_name, model_col)
            
            print_success('✅ 数据库迁移完成')
        except Exception as e:
            print_error(f"数据库迁移失败: {e}")
            import traceback
            traceback.print_exc()
    
    def _add_column(self, table_name: str, column_name: str, column: Column):
        """
        添加字段到现有表
        
        Args:
            table_name: 表名
            column_name: 字段名
            column: SQLAlchemy Column 对象
        """
        try:
            # 构建 ALTER TABLE 语句
            if self.connection_str and ('postgresql' in self.connection_str or 'postgres' in self.connection_str):
                # PostgreSQL 语法
                col_type = str(column.type)
                nullable = "NULL" if column.nullable else "NOT NULL"
                default = ""
                
                # 处理默认值
                if column.default is not None:
                    if hasattr(column.default, 'arg'):
                        default_val = column.default.arg
                        if isinstance(default_val, bool):
                            default = f" DEFAULT {str(default_val).upper()}"
                        elif isinstance(default_val, (int, float)):
                            default = f" DEFAULT {default_val}"
                        else:
                            default = f" DEFAULT '{default_val}'"
                    elif callable(column.default):
                        # 可调用的默认值（如函数）
                        default = ""
                
                alter_sql = f'ALTER TABLE "{table_name}" ADD COLUMN "{column_name}" {col_type} {nullable}{default}'
            else:
                # SQLite/MySQL 语法
                col_type = str(column.type)
                nullable = "" if column.nullable else "NOT NULL"
                default = ""
                
                if column.default is not None:
                    if hasattr(column.default, 'arg'):
                        default_val = column.default.arg
                        if isinstance(default_val, bool):
                            default = f" DEFAULT {1 if default_val else 0}"
                        elif isinstance(default_val, (int, float)):
                            default = f" DEFAULT {default_val}"
                        else:
                            default = f" DEFAULT '{default_val}'"
                
                alter_sql = f"ALTER TABLE {table_name} ADD COLUMN {column_name} {col_type} {nullable}{default}"
            
            # 执行 ALTER TABLE
            with self.engine.begin() as conn:
                conn.execute(text(alter_sql))
            
            print_success(f"  ✅ 添加字段: {table_name}.{column_name}")
            
            # 如果是 PostgreSQL，添加注释
            if self.connection_str and ('postgresql' in self.connection_str or 'postgres' in self.connection_str):
                if hasattr(column, 'comment') and column.comment:
                    comment_sql = f"COMMENT ON COLUMN \"{table_name}\".\"{column_name}\" IS '{column.comment}';"
                    try:
                        with self.engine.begin() as conn:
                            conn.execute(text(comment_sql))
                    except:
                        pass  # 注释添加失败不影响主流程
                        
        except SQLAlchemyError as e:
            # 如果字段已存在或其他错误，记录但不中断
            error_msg = str(e)
            if "already exists" in error_msg or "duplicate column" in error_msg.lower():
                print_info(f"  ℹ️  字段已存在: {table_name}.{column_name}")
            else:
                print_warning(f"  ⚠️  添加字段失败 {table_name}.{column_name}: {error_msg}")    
        
    def close(self) -> None:
        """Close the database connection"""
        if self.SESSION:
            self.SESSION.close()
            self.SESSION.remove()
            
    def __enter__(self):
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
    def delete_article(self,article_data:dict)->bool:
        try:
            art = Article(**article_data)
            if art.id:
               art.id=f"{str(art.mp_id)}-{art.id}".replace("MP_WXS_","")
            session=DB.get_session()
            article = session.query(Article).filter(Article.id == art.id).first()
            if article is not None:
                session.delete(article)
                session.commit()
                return True
        except Exception as e:
            print_error(f"delete article:{str(e)}")
            pass      
        return False
     
    def add_article(self, article_data: dict,check_exist=False) -> bool:
        try:
            session=self.get_session()
            from datetime import datetime, date
            art = Article(**article_data)
            if art.id:
               art.id=f"{str(art.mp_id)}-{art.id}".replace("MP_WXS_","")
            
            # 检查文章的发布时间是否早于配置的采集起始时间
            if art.publish_time:
                try:
                    # 从配置中获取采集起始时间
                    from core.models.config_management import ConfigManagement
                    config = session.query(ConfigManagement).filter(
                        ConfigManagement.config_key == 'collect_start_date'
                    ).first()
                    
                    if config and config.config_value:
                        try:
                            start_date = datetime.strptime(config.config_value, '%Y-%m-%d').date()
                            # 将 publish_time 转换为日期进行比较
                            if isinstance(art.publish_time, (int, float)):
                                # 如果是时间戳，转换为日期
                                publish_timestamp = int(art.publish_time)
                                if publish_timestamp < 10000000000:  # 秒级时间戳
                                    publish_timestamp *= 1000
                                publish_date = datetime.fromtimestamp(publish_timestamp / 1000).date()
                            else:
                                # 如果是 datetime 对象，直接获取日期
                                publish_date = art.publish_time.date() if hasattr(art.publish_time, 'date') else art.publish_time
                            
                            # 如果文章发布时间早于起始时间，跳过保存
                            if publish_date < start_date:
                                print_info(f"文章发布时间 {publish_date} 早于采集起始时间 {start_date}，跳过保存: {art.title[:50]}")
                                return False
                        except (ValueError, TypeError, AttributeError) as e:
                            # 日期解析失败，记录警告但继续保存
                            print_warning(f"解析采集起始时间或文章发布时间失败: {e}")
                except Exception as e:
                    # 读取配置失败，记录警告但继续保存（使用默认行为）
                    print_warning(f"读取采集起始时间配置失败: {e}")
            
            # 始终检查文章是否已存在（基于ID）
            existing_article = session.query(Article).filter(Article.id == art.id).first()
            if existing_article is not None:
                if check_exist:
                    print_warning(f"Article already exists: {art.id}")
                    return False
                else:
                    # 如果已存在但不要求检查，可以选择更新或跳过
                    # 这里选择跳过，避免重复插入
                    print_info(f"Article already exists, skipping: {art.id}")
                    return False
                
            if art.created_at is None:
                art.created_at=datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            if art.updated_at is None:
                art.updated_at=datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            art.created_at=datetime.strptime(art.created_at ,'%Y-%m-%d %H:%M:%S')
            art.updated_at=datetime.strptime(art.updated_at,'%Y-%m-%d %H:%M:%S')
            art.content=art.content
            from core.models.base import DATA_STATUS
            art.status=DATA_STATUS.ACTIVE
            session.add(art)
            session.flush()  # 先 flush 获取 article.id
            
            # ========== 自动提取标签 ==========
            try:
                # 基于文章内容自动提取标签（会自动创建新标签）
                auto_extract_enabled = cfg.get("article_tag.auto_extract", True)
                print_info(f"🔍 标签提取配置: auto_extract={auto_extract_enabled}")
                
                if auto_extract_enabled:
                    content_length = len(art.content or "")
                    print_info(f"📝 文章内容长度: {content_length}, 标题: {art.title[:50]}")
                    self._assign_tags_by_extraction(
                        session, 
                        art.id, 
                        art.title, 
                        art.description or "", 
                        art.content or ""
                    )
                else:
                    print_warning("⚠️  标签自动提取已禁用")
            except Exception as tag_error:
                # 标签提取失败不影响文章保存
                print_warning(f"自动提取标签失败: {tag_error}")
                import traceback
                traceback.print_exc()
            # ==========================================
            
            sta=session.commit()
            
        except Exception as e:
            # 处理各种数据库的唯一约束错误
            error_str = str(e)
            if "UNIQUE" in error_str or "Duplicate entry" in error_str or "UniqueViolation" in error_str or "duplicate key" in error_str.lower():
                print_warning(f"Article already exists (duplicate key): {art.id}")
                # 尝试回滚，避免事务问题
                try:
                    session.rollback()
                except:
                    pass
                return False
            else:
                print_error(f"Failed to add article: {e}")
                import traceback
                traceback.print_exc()
                try:
                    session.rollback()
                except:
                    pass
                return False
        return True    
        
    def get_articles(self, id:str=None, limit:int=30, offset:int=0) -> List[Article]:
        try:
            data = self.get_session().query(Article).limit(limit).offset(offset)
            return data
        except Exception as e:
            print(f"Failed to fetch Feed: {e}")
            return e    
             
    def get_all_mps(self) -> List[Feed]:
        """Get all Feed records"""
        try:
            return self.get_session().query(Feed).all()
        except Exception as e:
            print(f"Failed to fetch Feed: {e}")
            return e
            
    def get_mps_list(self, mp_ids:str) -> List[Feed]:
        try:
            ids=mp_ids.split(',')
            data =  self.get_session().query(Feed).filter(Feed.id.in_(ids)).all()
            return data
        except Exception as e:
            print(f"Failed to fetch Feed: {e}")
            return e
    def get_mps(self, mp_id:str) -> Optional[Feed]:
        try:
            ids=mp_id.split(',')
            data =  self.get_session().query(Feed).filter_by(id= mp_id).first()
            return data
        except Exception as e:
            print(f"Failed to fetch Feed: {e}")
            return e

    def get_faker_id(self, mp_id:str):
        data = self.get_mps(mp_id)
        return data.faker_id
    def expire_all(self):
        if self.Session:
            self.Session.expire_all()    
    def bind_event(self,session):
        # Session Events
        @event.listens_for(session, 'before_commit')
        def receive_before_commit(session):
            print("Transaction is about to be committed.")

        @event.listens_for(session, 'after_commit')
        def receive_after_commit(session):
            print("Transaction has been committed.")

        # Connection Events
        @event.listens_for(self.engine, 'connect')
        def connect(dbapi_connection, connection_record):
            print("New database connection established.")

        @event.listens_for(self.engine, 'close')
        def close(dbapi_connection, connection_record):
            print("Database connection closed.")
    def get_session(self):
        """获取新的数据库会话"""
        UseInThread=self.User_In_Thread
        def _session():
            if UseInThread:
                self.Session=scoped_session(self.session_factory)
                # self.Session=self.session_factory
            else:
                self.Session=self.session_factory
            # self.bind_event(self.Session)
            return self.Session
        
        
        if self.Session is None:
            _session()
        
        session = self.Session()
        # session.expire_all()
        # session.expire_on_commit = True  # 确保每次提交后对象过期
        # 检查会话是否已经关闭
        if not session.is_active:
            from core.print import print_info
            print_info(f"[{self.tag}] Session is already closed.")
            _session()
            return self.Session()
        # 检查数据库连接是否已断开
        try:
            from core.models import User
            # 尝试执行一个简单的查询来检查连接状态
            session.query(User.id).count()
        except Exception as e:
            from core.print import print_warning
            print_warning(f"[{self.tag}] Database connection lost: {e}. Reconnecting...")
            self.init(self.connection_str)
            _session()
            return self.Session()
        return session
    def auto_refresh(self):
        # 定义一个事件监听器，在对象更新后自动刷新
        def receive_after_update(mapper, connection, target):
            print(f"Refreshing object: {target}")
        from core.models import MessageTask,Article
        event.listen(Article,'after_update', receive_after_update)
        event.listen(MessageTask,'after_update',receive_after_update)
        
    def session_dependency(self):
        """FastAPI依赖项，用于请求范围的会话管理"""
        session = self.get_session()
        try:
            yield session
        finally:
            session.remove()
    
    def _assign_tags_by_extraction(self, session, article_id: str, title: str, description: str = "", content: str = ""):
        """使用提取方式自动提取标签并关联（标签存储在 tags 表，通过 article_tags 关联）"""
        try:
            from core.models.tags import Tags
            from core.models.article_tags import ArticleTag
            from core.tag_extractor import TagExtractor
            import uuid
            from datetime import datetime
            
            # 获取提取方式
            extract_method = cfg.get("article_tag.extract_method", "textrank")
            
            # 使用全局单例提取器（模型常驻内存）
            from core.tag_extractor import get_tag_extractor
            extractor = get_tag_extractor()
            
            # 提取标签关键词
            if extract_method == "ai":
                # AI 提取是异步的，需要特殊处理
                import asyncio
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        # 如果事件循环正在运行，使用线程池
                        import concurrent.futures
                        with concurrent.futures.ThreadPoolExecutor() as executor:
                            future = executor.submit(
                                asyncio.run,
                                extractor.extract_with_ai(
                                    title, 
                                    description, 
                                    content,
                                    cfg.get("article_tag.max_topics", 3)
                                )
                            )
                            topics = future.result()
                    else:
                        topics = asyncio.run(extractor.extract_with_ai(
                            title, 
                            description, 
                            content,
                            cfg.get("article_tag.max_topics", 3)
                        ))
                except RuntimeError:
                    topics = asyncio.run(extractor.extract_with_ai(
                        title, 
                        description, 
                        content,
                        cfg.get("article_tag.max_topics", 3)
                    ))
                except Exception as ai_error:
                    print_warning(f"⚠️  AI 提取失败，回退到 TextRank: {ai_error}")
                    # AI 提取失败时回退到 TextRank
                    topics = extractor.extract(title, description, content, method="textrank")
                    print_info(f"🔍 TextRank 提取到 {len(topics)} 个关键词: {topics}")
            else:
                # TextRank 或 KeyBERT 提取（同步）
                try:
                    topics = extractor.extract(title, description, content, method=extract_method)
                    print_info(f"🔍 {extract_method} 提取到 {len(topics)} 个关键词: {topics}")
                except Exception as extract_error:
                    print_warning(f"⚠️  {extract_method} 提取失败: {extract_error}")
                    # 提取失败时尝试使用 TextRank 作为后备
                    topics = extractor.extract(title, description, content, method="textrank")
                    print_info(f"🔍 TextRank 提取到 {len(topics)} 个关键词: {topics}")
            
            if not topics:
                print_warning(f"⚠️  未提取到任何关键词，标题: {title[:50]}")
                return
            
            assigned_count = 0
            auto_create = True  # 始终启用自动创建标签
            
            # 获取文章的发布日期，用于设置标签的创建时间
            article = session.query(Article).filter(Article.id == article_id).first()
            tag_created_at = datetime.now()  # 默认使用当前时间
            if article and article.publish_time:
                try:
                    # 将 publish_time（时间戳）转换为 datetime
                    publish_timestamp = int(article.publish_time)
                    if publish_timestamp < 10000000000:  # 秒级时间戳
                        publish_timestamp *= 1000
                    tag_created_at = datetime.fromtimestamp(publish_timestamp / 1000)
                except Exception as e:
                    print_warning(f"转换文章发布时间失败，使用当前时间: {e}")
                    tag_created_at = datetime.now()
            
            for topic_name in topics:
                # 查找匹配的标签
                tag = session.query(Tags).filter(
                    Tags.name == topic_name,
                    Tags.status == 1
                ).first()
                
                if tag:
                    # 检查是否已存在关联
                    existing = session.query(ArticleTag).filter(
                        ArticleTag.article_id == article_id,
                        ArticleTag.tag_id == tag.id
                    ).first()
                    
                    if not existing:
                        article_tag = ArticleTag(
                            id=str(uuid.uuid4()),
                            article_id=article_id,
                            tag_id=tag.id,
                            created_at=datetime.now(),  # 关联创建时间（当前时间）
                            article_publish_date=tag_created_at  # 文章的发布日期（用于趋势统计）
                        )
                        session.add(article_tag)
                        assigned_count += 1
                elif auto_create:
                    # 自动创建新标签（所有模式都支持）
                    try:
                        import json
                        new_tag = Tags(
                            id=str(uuid.uuid4()),
                            name=topic_name,
                            cover="",
                            intro=f"自动创建的标签：{topic_name}",
                            mps_id="[]",  # 空数组
                            status=1,
                            created_at=tag_created_at,  # 使用文章的发布日期
                            updated_at=tag_created_at   # 使用文章的发布日期
                        )
                        session.add(new_tag)
                        session.flush()  # 获取新标签的 ID
                        
                        article_tag = ArticleTag(
                            id=str(uuid.uuid4()),
                            article_id=article_id,
                            tag_id=new_tag.id,
                            created_at=datetime.now(),  # 关联创建时间（当前时间）
                            article_publish_date=tag_created_at  # 文章的发布日期（用于趋势统计）
                        )
                        session.add(article_tag)
                        assigned_count += 1
                        print_success(f"✅ 自动创建标签: {topic_name}")
                    except Exception as e:
                        print_warning(f"自动创建标签失败: {e}")
            
            if assigned_count > 0:
                print_success(f"✅ 文章 {article_id} 已关联 {assigned_count} 个标签（基于提取）")
            else:
                print_warning(f"⚠️  文章 {article_id} 未关联任何标签")
        except Exception as e:
            print_error(f"提取标签并关联失败: {e}")
            import traceback
            traceback.print_exc()

# 全局数据库实例
DB = Db(User_In_Thread=True)
# 初始化已在 __init__ 中完成，这里不需要再次调用