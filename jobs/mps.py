from datetime import datetime, date, timedelta
from core.models.article import Article
from .article import UpdateArticle,Update_Over
import core.db as db
from core.wx import WxGather
from core.log import logger
from core.task import TaskScheduler
from core.models.feed import Feed
from core.config import cfg,DEBUG
from core.print import print_info,print_success,print_error,print_warning
from driver.wx import WX_API
from driver.success import Success
wx_db=db.Db(tag="任务调度")

def calculate_pages_from_month_start():
    """计算从配置的起始时间到现在需要抓取的页数"""
    today = date.today()
    
    # 从配置中获取采集起始时间
    start_date_str = None
    try:
        from core.models.config_management import ConfigManagement
        session = db.DB.get_session()
        try:
            config = session.query(ConfigManagement).filter(
                ConfigManagement.config_key == 'collect_start_date'
            ).first()
            if config and config.config_value:
                start_date_str = config.config_value
        finally:
            session.close()
    except Exception as e:
        logger.warning(f"读取采集起始时间配置失败: {e}")
    
    # 如果没有配置或配置无效，使用默认值：2025-12-01
    if not start_date_str:
        start_date_str = '2025-12-01'
    
    try:
        # 解析日期字符串
        start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        # 如果日期格式错误，使用默认值：2025-12-01
        logger.warning(f"采集起始时间格式错误: {start_date_str}，使用默认值 2025-12-01")
        start_date = date(2025, 12, 1)
    
    # 确保起始日期不超过今天
    if start_date > today:
        logger.warning(f"采集起始时间 {start_date} 超过今天，使用今天作为起始时间")
        start_date = today
    
    # 计算从起始日期到现在的天数
    days_since_start = (today - start_date).days + 1  # +1 包括今天
    # 假设每天最多发布5篇文章（一页），计算需要的页数
    # 为了保险起见，多抓取一些页数
    estimated_pages = max(1, days_since_start + 2)  # 至少1页，多抓2页作为缓冲
    print_info(f"采集起始时间: {start_date}, 预计抓取 {estimated_pages} 页")
    return estimated_pages
def fetch_all_article():
    print("开始更新")
    wx=WxGather().Model()
    try:
        # 获取公众号列表
        mps=db.DB.get_all_mps()
        for item in mps:
            try:
                wx.get_Articles(item.faker_id,CallBack=UpdateArticle,Mps_id=item.id,Mps_title=item.mp_name, MaxPage=1)
            except Exception as e:
                print(e)
        print(wx.articles) 
    except Exception as e:
        print(e)         
    finally:
        logger.info(f"所有公众号更新完成,共更新{wx.all_count()}条数据")


def test(info:str):
    print("任务测试成功",info)

from core.models.message_task import MessageTask
# from core.queue import TaskQueue
from .webhook import web_hook
interval=int(cfg.get("interval",60)) # 每隔多少秒执行一次

def get_existing_articles(mp_id: str, limit: int = 10):
    """
    从数据库获取指定公众号的已有文章
    
    参数:
        mp_id: 公众号ID
        limit: 获取文章数量限制，默认10篇
        
    返回:
        文章列表（Article对象列表）
    """
    try:
        session = db.DB.get_session()
        try:
            # 查询该公众号的已有文章，按发布时间降序排列
            articles = session.query(Article).filter(
                Article.mp_id == mp_id
            ).order_by(Article.publish_time.desc()).limit(limit).all()
            return articles
        finally:
            session.close()
    except Exception as e:
        logger.error(f"获取已有文章失败: {e}")
        return []

def get_article_tags(session, article_ids: list):
    """
    批量获取文章的标签信息
    
    参数:
        session: 数据库会话
        article_ids: 文章ID列表
        
    返回:
        字典，key为article_id，value为标签名称列表
    """
    if not article_ids:
        return {}
    
    try:
        from core.models.article_tags import ArticleTag
        from core.models.tags import Tags as TagsModel
        
        # 批量查询文章标签关联
        article_tags = session.query(ArticleTag).filter(
            ArticleTag.article_id.in_(article_ids)
        ).all()
        
        # 获取所有标签ID
        tag_ids = list(set([at.tag_id for at in article_tags]))
        
        # 批量查询标签信息
        tags_dict = {}
        if tag_ids:
            tags = session.query(TagsModel).filter(TagsModel.id.in_(tag_ids)).all()
            tags_dict = {t.id: t.name for t in tags}
        
        # 按文章ID分组标签
        tags_by_article = {}
        for at in article_tags:
            if at.article_id not in tags_by_article:
                tags_by_article[at.article_id] = []
            if at.tag_id in tags_dict:
                tags_by_article[at.article_id].append(tags_dict[at.tag_id])
        
        return tags_by_article
    except Exception as e:
        logger.error(f"获取文章标签失败: {e}")
        return {}

def get_today_articles(mp_id: str = None):
    """
    从数据库获取当天的文章
    
    参数:
        mp_id: 公众号ID，如果为None则获取所有公众号的当天文章
        
    返回:
        文章列表（Article对象列表）
    """
    try:
        session = db.DB.get_session()
        try:
            # 计算今天的开始时间戳（0点）
            today = date.today()
            today_start = int(datetime.combine(today, datetime.min.time()).timestamp())
            # 计算明天的开始时间戳
            tomorrow_start = int((datetime.combine(today, datetime.min.time()) + timedelta(days=1)).timestamp())
            
            query = session.query(Article).filter(
                Article.publish_time >= today_start,
                Article.publish_time < tomorrow_start
            )
            
            if mp_id:
                query = query.filter(Article.mp_id == mp_id)
            
            # 按发布时间降序排列
            articles = query.order_by(Article.publish_time.desc()).all()
            return articles
        finally:
            session.close()
    except Exception as e:
        logger.error(f"获取当天文章失败: {e}")
        return []

def do_job(mp=None,task:MessageTask=None,isTest=False):
        # TaskQueue.add_task(test,info=datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        # print("执行任务", task.mps_id)
        if isTest:
            print("执行测试任务（不抓取文章，使用已有文章）")
        else:
            print("执行任务")
        all_count=0
        wx=WxGather().Model()
        try:
            if isTest:
                # 测试模式：从数据库获取已有文章
                print_info(f"测试模式：从数据库获取 {mp.mp_name} 的已有文章")
                existing_articles = get_existing_articles(mp.id, limit=10)
                if not existing_articles:
                    print_warning(f"公众号 {mp.mp_name} 没有已有文章，无法发送测试消息")
                    return
                # 批量获取标签信息
                session = db.DB.get_session()
                try:
                    article_ids = [article.id for article in existing_articles]
                    tags_by_article = get_article_tags(session, article_ids)
                finally:
                    session.close()
                
                # 将 Article 对象转换为字典格式，兼容 wx.articles 格式
                wx.articles = []
                for article in existing_articles:
                    article_dict = {
                        'id': article.id,
                        'mp_id': article.mp_id,
                        'title': article.title,
                        'pic_url': article.pic_url,
                        'url': article.url,
                        'description': article.description,
                        'publish_time': article.publish_time,
                        'content': getattr(article, 'content', None),
                        'tags': tags_by_article.get(article.id, []),
                        'tag_names': tags_by_article.get(article.id, [])
                    }
                    # 格式化发布时间
                    if article_dict.get('publish_time'):
                        try:
                            publish_time = article_dict['publish_time']
                            if isinstance(publish_time, (int, float)):
                                from datetime import datetime
                                dt = datetime.fromtimestamp(publish_time)
                                article_dict['publish_time'] = dt.strftime("%Y-%m-%d %H:%M:%S")
                        except Exception as e:
                            print_warning(f"格式化发布时间失败: {e}")
                    wx.articles.append(article_dict)
                print_info(f"获取到 {len(wx.articles)} 篇已有文章")
            else:
                # 正常模式：抓取新文章
                # 计算从月初到现在需要抓取的页数
                max_pages = calculate_pages_from_month_start()
                print_info(f"从月初开始抓取，预计抓取 {max_pages} 页")
                wx.get_Articles(mp.faker_id,CallBack=UpdateArticle,Mps_id=mp.id,Mps_title=mp.mp_name, MaxPage=max_pages,Over_CallBack=Update_Over,interval=interval)
                
                # 抓取完成后，为文章添加标签信息
                if wx.articles:
                    # 获取所有文章的ID（如果文章已保存到数据库）
                    article_ids = []
                    for article in wx.articles:
                        if isinstance(article, dict):
                            article_id = article.get('id', '')
                            if article_id:
                                article_ids.append(article_id)
                    
                    # 批量查询标签
                    tags_by_article = {}
                    if article_ids:
                        session = db.DB.get_session()
                        try:
                            tags_by_article = get_article_tags(session, article_ids)
                        finally:
                            session.close()
                    
                    # 为文章添加标签信息
                    for article in wx.articles:
                        if isinstance(article, dict):
                            article_id = article.get('id', '')
                            if article_id:
                                article['tags'] = tags_by_article.get(article_id, [])
                                article['tag_names'] = tags_by_article.get(article_id, [])
                            else:
                                # 如果文章还没有ID（新抓取的），标签为空
                                article['tags'] = []
                                article['tag_names'] = []
        except Exception as e:
            print_error(e)
            # raise
        finally:
            count=wx.all_count()
            all_count+=count
            from jobs.webhook import MessageWebHook 
            tms=MessageWebHook(task=task,feed=mp,articles=wx.articles)
            web_hook(tms)
            if isTest:
                print_success(f"测试任务({task.id})[{mp.mp_name}]执行成功,使用{count}篇已有文章")
            else:
                print_success(f"任务({task.id})[{mp.mp_name}]执行成功,{count}成功条数")

from core.queue import TaskQueue

def do_job_all_feeds(feeds: list[Feed] = None, task: MessageTask = None, isTest: bool = False):
    """
    处理所有公众号，汇总文章后一次性发送
    
    参数:
        feeds: 公众号列表
        task: 消息任务
        isTest: 是否为测试模式
    """
    # 确保使用全局 logger（已在文件顶部导入）
    global logger
    
    if isTest:
        print("【任务执行】执行测试任务（汇总所有公众号，使用已有文章）", flush=True)
        print_info("【任务执行】执行测试任务（汇总所有公众号，使用已有文章）")
    else:
        print("【任务执行】执行任务（汇总所有公众号）", flush=True)
        print_info("【任务执行】执行任务（汇总所有公众号）")
    
    all_articles_by_feed = []  # 按公众号分组的文章列表
    
    # 收集所有公众号的文章
    for feed in feeds:
        try:
            if isTest:
                # 测试模式：从数据库获取当天的文章
                print_info(f"测试模式：从数据库获取 {feed.mp_name} 的当天文章")
                existing_articles = get_today_articles(feed.id)
                if existing_articles:
                    # 批量获取标签信息
                    session = db.DB.get_session()
                    try:
                        article_ids = [article.id for article in existing_articles]
                        tags_by_article = get_article_tags(session, article_ids)
                    finally:
                        session.close()
                    
                    # 转换为字典格式，并格式化发布时间
                    articles_list = []
                    for article in existing_articles:
                        article_dict = {
                            'id': article.id,
                            'mp_id': article.mp_id,
                            'title': article.title or '',
                            'pic_url': article.pic_url or '',
                            'url': article.url or '',
                            'description': article.description or '',
                            'publish_time': article.publish_time,
                            'content': getattr(article, 'content', None),
                            'tags': tags_by_article.get(article.id, []),
                            'tag_names': tags_by_article.get(article.id, [])
                        }
                        # 格式化发布时间（如果是时间戳）
                        if article_dict.get('publish_time'):
                            try:
                                publish_time = article_dict['publish_time']
                                if isinstance(publish_time, (int, float)):
                                    # 时间戳转换为可读格式
                                    from datetime import datetime
                                    dt = datetime.fromtimestamp(publish_time)
                                    article_dict['publish_time'] = dt.strftime("%Y-%m-%d %H:%M:%S")
                                elif isinstance(publish_time, str) and publish_time.isdigit():
                                    # 字符串格式的时间戳
                                    from datetime import datetime
                                    dt = datetime.fromtimestamp(int(publish_time))
                                    article_dict['publish_time'] = dt.strftime("%Y-%m-%d %H:%M:%S")
                            except Exception as e:
                                print_warning(f"格式化发布时间失败: {e}, 使用原始值")
                        
                        articles_list.append(article_dict)
                    all_articles_by_feed.append({
                        'feed': feed,
                        'articles': articles_list
                    })
                    print_info(f"获取到 {feed.mp_name} 的 {len(articles_list)} 篇已有文章")
            else:
                # 正常模式：抓取新文章
                print_info(f"抓取 {feed.mp_name} 的新文章")
                wx = WxGather().Model()
                max_pages = calculate_pages_from_month_start()
                wx.get_Articles(feed.faker_id, CallBack=UpdateArticle, Mps_id=feed.id, Mps_title=feed.mp_name, MaxPage=max_pages, Over_CallBack=Update_Over, interval=interval)
                if wx.articles:
                    # 统一转换为字典格式，并格式化发布时间
                    articles_list = []
                    print_info(f"开始处理 {feed.mp_name} 的 {len(wx.articles)} 篇文章")
                    
                    # 批量获取标签信息（如果文章有ID）
                    article_ids = []
                    for idx, article in enumerate(wx.articles):
                        if isinstance(article, dict):
                            article_id = str(article.get('id', '')) if article.get('id') is not None else ''
                            if article_id:
                                article_ids.append(article_id)
                        else:
                            article_id = str(getattr(article, 'id', '')) if getattr(article, 'id', None) else ''
                            if article_id:
                                article_ids.append(article_id)
                    
                    # 批量查询标签
                    tags_by_article = {}
                    if article_ids:
                        session = db.DB.get_session()
                        try:
                            tags_by_article = get_article_tags(session, article_ids)
                        finally:
                            session.close()
                    
                    for idx, article in enumerate(wx.articles):
                        # 调试：打印原始文章数据结构
                        if idx < 2:  # 只打印前2篇
                            print_info(f"  原始文章 {idx+1} 类型: {type(article)}")
                            if isinstance(article, dict):
                                print_info(f"    字典键: {list(article.keys())}")
                                print_info(f"    title值: {repr(article.get('title', 'NOT_FOUND'))}")
                                print_info(f"    url值: {repr(article.get('url', 'NOT_FOUND'))}")
                                print_info(f"    link值: {repr(article.get('link', 'NOT_FOUND'))}")
                        
                        # 如果已经是字典，确保字段不为 None
                        if isinstance(article, dict):
                            # 直接获取字段值，不进行额外的转换
                            title = article.get('title', '')
                            url = article.get('url', '') or article.get('link', '')
                            article_id = str(article.get('id', '')) if article.get('id') is not None else ''
                            
                            # 确保字段是字符串类型，且不为 None
                            article_dict = {
                                'id': article_id,
                                'mp_id': str(article.get('mp_id', '')) if article.get('mp_id') is not None else '',
                                'title': str(title) if title is not None else '',
                                'pic_url': str(article.get('pic_url', '')) if article.get('pic_url') is not None else '',
                                'url': str(url) if url is not None else '',
                                'description': str(article.get('description', '')) if article.get('description') is not None else '',
                                'publish_time': article.get('publish_time', ''),
                                'content': article.get('content', None),
                                'tags': tags_by_article.get(article_id, []),
                                'tag_names': tags_by_article.get(article_id, [])
                            }
                            
                            # 如果 title 或 url 为空，打印警告和完整字典内容
                            if not article_dict['title'] or not article_dict['url']:
                                print_warning(f"文章数据不完整: id={article_dict['id']}, title={repr(title)}, url={repr(url)}")
                                print_warning(f"  原始字典完整内容: {article}")
                            
                            # 调试：打印转换后的数据
                            if idx < 2:
                                print_info(f"    转换后: title='{article_dict['title'][:50] if article_dict['title'] else '(空)'}', url='{article_dict['url'][:50] if article_dict['url'] else '(空)'}'")
                        else:
                            article_id = str(getattr(article, 'id', '')) if getattr(article, 'id', None) else ''
                            article_dict = {
                                'id': article_id,
                                'mp_id': str(getattr(article, 'mp_id', '')) if getattr(article, 'mp_id', None) else '',
                                'title': str(getattr(article, 'title', '')) if getattr(article, 'title', None) else '',
                                'pic_url': str(getattr(article, 'pic_url', '')) if getattr(article, 'pic_url', None) else '',
                                'url': str(getattr(article, 'url', '') or getattr(article, 'link', '')) if (getattr(article, 'url', None) or getattr(article, 'link', None)) else '',
                                'description': str(getattr(article, 'description', '')) if getattr(article, 'description', None) else '',
                                'publish_time': getattr(article, 'publish_time', ''),
                                'content': getattr(article, 'content', None),
                                'tags': tags_by_article.get(article_id, []),
                                'tag_names': tags_by_article.get(article_id, [])
                            }
                        
                        # 格式化发布时间（如果是时间戳）
                        if article_dict.get('publish_time'):
                            try:
                                publish_time = article_dict['publish_time']
                                if isinstance(publish_time, (int, float)):
                                    # 时间戳转换为可读格式
                                    from datetime import datetime
                                    dt = datetime.fromtimestamp(publish_time)
                                    article_dict['publish_time'] = dt.strftime("%Y-%m-%d %H:%M:%S")
                                elif isinstance(publish_time, str) and publish_time.isdigit():
                                    # 字符串格式的时间戳
                                    from datetime import datetime
                                    dt = datetime.fromtimestamp(int(publish_time))
                                    article_dict['publish_time'] = dt.strftime("%Y-%m-%d %H:%M:%S")
                            except Exception as e:
                                print_warning(f"格式化发布时间失败: {e}, 使用原始值")
                        
                        articles_list.append(article_dict)
                    
                    # 只有当有文章时才添加到列表
                    if articles_list:
                        all_articles_by_feed.append({
                            'feed': feed,
                            'articles': articles_list
                        })
                        print_info(f"抓取到 {feed.mp_name} 的 {len(articles_list)} 篇新文章")
                    else:
                        print_warning(f"{feed.mp_name} 没有抓取到文章，跳过")
        except Exception as e:
            print_error(f"处理公众号 {feed.mp_name} 时出错: {e}")
            continue
    
    # 如果没有收集到任何文章，直接返回
    if not all_articles_by_feed:
        print_warning("没有收集到任何文章，无法发送消息")
        return
    
    # 计算总文章数
    total_articles = sum(len(item['articles']) for item in all_articles_by_feed)
    
    if total_articles == 0:
        print_warning("没有文章可发送")
        return
    
    # 构建汇总消息
    from core.lax import TemplateParser
    from core.notice import notice
    
    # 使用汇总模板
    # 注意：TemplateParser 支持点号访问字典，直接遍历列表即可（空列表不会执行循环）
    # 确保所有字段都有默认值，避免显示为空
    default_template = """{{ today }} 每日科技聚合资讯

{% for item in feeds_with_articles %}
## {{ item.feed.mp_name }}

{% for article in item.articles %}
- [**{{ article.title }}**]({{ article.url }}){% if article.tag_names %} 🏷️ {{= ', '.join(article.tag_names) if isinstance(article.tag_names, list) else str(article.tag_names) }}{% endif %}
{% endfor %}

{% endfor %}

---
📊 共 {{ total_articles }} 篇文章，来自 {{ feeds_count }} 个公众号
"""
    
    # 如果用户自定义了模板，检查是否支持汇总格式
    # 如果不支持，使用默认汇总模板
    user_template = task.message_template if task.message_template else None
    if user_template and 'feeds_with_articles' in user_template:
        template = user_template
    else:
        template = default_template
    
    parser = TemplateParser(template)
    # 确保数据格式正确：将字典列表转换为模板可以访问的格式
    # TemplateParser 支持点号访问，所以 item.articles 应该可以工作
    # 但为了确保兼容性，我们同时提供两种格式
    # 获取今天的日期
    today_date = datetime.now().strftime("%Y-%m-%d")
    
    data = {
        "feeds_with_articles": all_articles_by_feed,
        "total_articles": total_articles,
        "feeds_count": len(all_articles_by_feed),
        "task": task,
        'now': today_date,
        'today': today_date
    }
    
    # 调试：打印传递给模板的数据结构
    debug_data = "=" * 80 + "\n"
    debug_data += "【传递给模板的数据结构】\n"
    debug_data += "=" * 80 + "\n"
    debug_data += f"feeds_with_articles 类型: {type(data['feeds_with_articles'])}\n"
    debug_data += f"feeds_with_articles 长度: {len(data['feeds_with_articles'])}\n"
    if len(data['feeds_with_articles']) > 0:
        first_item = data['feeds_with_articles'][0]
        debug_data += f"第一个 item 类型: {type(first_item)}\n"
        debug_data += f"第一个 item 键: {list(first_item.keys()) if isinstance(first_item, dict) else '不是字典'}\n"
        if isinstance(first_item, dict) and 'articles' in first_item:
            debug_data += f"第一个 item['articles'] 类型: {type(first_item['articles'])}\n"
            debug_data += f"第一个 item['articles'] 长度: {len(first_item['articles'])}\n"
            if len(first_item['articles']) > 0:
                first_article = first_item['articles'][0]
                debug_data += f"第一篇文章类型: {type(first_article)}\n"
                debug_data += f"第一篇文章内容: {first_article}\n"
    debug_data += "=" * 80 + "\n"
    print(debug_data, flush=True)
    # logger 已在文件顶部导入
    logger.info(debug_data)
    
    try:
        # 调试：打印数据结构（详细输出，确保能看到所有信息）
        import sys
        # logger 已在文件顶部导入
        
        debug_output = "=" * 80 + "\n"
        debug_output += "【模板渲染前的数据结构检查】\n"
        debug_output += "=" * 80 + "\n"
        debug_output += f"准备渲染模板，共 {len(all_articles_by_feed)} 个公众号\n"
        
        for idx, item in enumerate(all_articles_by_feed):
            feed_name = item['feed'].mp_name if hasattr(item['feed'], 'mp_name') else '未知'
            articles_count = len(item['articles'])
            debug_output += f"\n公众号 {idx+1}: {feed_name}\n"
            debug_output += f"  文章数: {articles_count}\n"
            debug_output += f"  item类型: {type(item)}\n"
            debug_output += f"  item['articles']类型: {type(item['articles'])}\n"
            
            if articles_count > 0:
                debug_output += f"  前 {min(3, articles_count)} 篇文章详情:\n"
                # 打印前3篇文章的详细数据
                for i, article in enumerate(item['articles'][:3]):
                    if isinstance(article, dict):
                        title = article.get('title', '')
                        url = article.get('url', '')
                        publish_time = article.get('publish_time', '')
                        tag_names = article.get('tag_names', [])
                        tags = article.get('tags', [])
                        debug_output += f"    文章 {i+1}:\n"
                        debug_output += f"      title='{title[:50] if title else '(空)'}'\n"
                        debug_output += f"      url='{url[:50] if url else '(空)'}'\n"
                        debug_output += f"      publish_time='{publish_time}'\n"
                        debug_output += f"      tag_names={tag_names} (类型: {type(tag_names)})\n"
                        debug_output += f"      tags={tags} (类型: {type(tags)})\n"
                        debug_output += f"      title类型={type(title)}, title值={repr(title)}\n"
                        debug_output += f"      url类型={type(url)}, url值={repr(url)}\n"
                        debug_output += f"      完整文章字典: {article}\n"
                    else:
                        debug_output += f"    文章 {i+1}: 不是字典格式，类型={type(article)}\n"
            else:
                debug_output += f"  ⚠️ 公众号 {feed_name} 没有文章！\n"
        
        debug_output += "=" * 80 + "\n"
        
        # 输出调试信息
        print(debug_output, flush=True)
        logger.info(debug_output)
        print_info(debug_output)
        
        message = parser.render(data)
        # 打印完整的渲染后消息，用于调试（使用多种方式确保输出可见）
        # logger 已在文件顶部导入
        
        output = "=" * 80 + "\n"
        output += "【完整渲染后的消息内容】\n"
        output += "=" * 80 + "\n"
        output += message + "\n"
        output += "=" * 80 + "\n"
        output += f"消息总长度: {len(message)} 字符\n"
        
        # 使用 print 输出到标准输出
        print(output, flush=True)
        # 使用 logger 输出到日志
        logger.info(output)
        # 使用 print_info 输出（带颜色）
        print_info("=" * 80)
        print_info("【完整渲染后的消息内容】")
        print_info("=" * 80)
        print_info(message)
        print_info("=" * 80)
        print_info(f"消息总长度: {len(message)} 字符")
        
        # 检查 webhook_url 是否为空
        if not task.web_hook_url:
            print_error(f"任务({task.id})的 web_hook_url 为空，无法发送消息")
            print_error(f"任务名称: {task.name}")
            print_error(f"任务ID: {task.id}")
            return
        
        print_info(f"准备发送消息到: {task.web_hook_url[:50]}...")
        print_info(f"任务名称: {task.name}")
        print_info(f"消息内容长度: {len(message)} 字符")
        
        try:
            result = notice(task.web_hook_url, task.name, message)
            if result:
                print_success(f"任务({task.id})执行成功,汇总了{len(all_articles_by_feed)}个公众号,共{total_articles}篇文章，消息已发送")
            else:
                print_error(f"任务({task.id})执行完成，但消息发送失败")
        except Exception as e:
            print_error(f"发送消息时出错: {e}")
            import traceback
            traceback.print_exc()
            print_success(f"任务({task.id})执行成功,汇总了{len(all_articles_by_feed)}个公众号,共{total_articles}篇文章，但消息发送失败")
    except Exception as e:
        print_error(f"发送汇总消息失败: {e}")
        import traceback
        traceback.print_exc()

def add_job(feeds:list[Feed]=None,task:MessageTask=None,isTest=False):
    if isTest:
        TaskQueue.clear_queue()
    
    if not feeds or len(feeds) == 0:
        print_warning("没有公众号可处理")
        return
    
    # 检查用户模板是否支持聚合格式
    user_template = task.message_template if task.message_template else None
    has_aggregate_template = user_template and 'feeds_with_articles' in user_template
    
    # 如果只有一个公众号，且用户模板不包含 feeds_with_articles，使用单个公众号逻辑
    if len(feeds) == 1 and not has_aggregate_template:
        # 单个公众号，使用单个公众号模板
        print_info(f"单个公众号模式：{feeds[0].mp_name}")
        TaskQueue.add_task(do_job, feeds[0], task, isTest)
        if isTest:
            print(f"测试任务，单个公众号，加入队列成功")
            reload_job()
        else:
            print(f"单个公众号任务，加入队列成功")
    else:
        # 多个公众号，或者用户模板包含 feeds_with_articles，使用聚合逻辑
        print_info(f"聚合模式：{len(feeds)}个公众号")
        TaskQueue.add_task(do_job_all_feeds, feeds, task, isTest)
        if isTest:
            print(f"测试任务，汇总{len(feeds)}个公众号，加入队列成功")
            reload_job()
        else:
            print(f"汇总任务，{len(feeds)}个公众号，加入队列成功")
    
    print_success(TaskQueue.get_queue_info())
    pass
import json
def get_feeds(task:MessageTask=None):
     """
     获取任务关联的公众号列表
     如果 mps_id 为空或解析后为空，返回所有公众号
     """
     try:
         mps = json.loads(task.mps_id) if task.mps_id else []
     except:
         mps = []
     
     if len(mps) == 0:
         # 如果没有指定公众号，返回所有公众号
         mps_list = wx_db.get_all_mps()
     else:
         # 获取指定的公众号
         ids = ",".join([item["id"] for item in mps if "id" in item])
         mps_list = wx_db.get_mps_list(ids) if ids else []
         # 如果指定的公众号不存在，返回所有公众号
         if len(mps_list) == 0:
             mps_list = wx_db.get_all_mps()
     return mps_list
scheduler=TaskScheduler()
def reload_job():
    print_success("重载任务")
    scheduler.clear_all_jobs()
    TaskQueue.clear_queue()
    start_job()

def run(job_id:str=None,isTest=False):
    from .taskmsg import get_message_task
    tasks=get_message_task(job_id)
    if not tasks:
        print("没有任务")
        return None
    for task in tasks:
            #添加测试任务
            print_warning(f"{task.name} 添加到队列运行")
            add_job(get_feeds(task),task,isTest=isTest)
            pass
    return tasks
def start_job(job_id:str=None):
    from .taskmsg import get_message_task
    tasks=get_message_task(job_id)
    if not tasks:
        print("没有任务")
        return
    tag="定时采集"
    for task in tasks:
        cron_exp=task.cron_exp
        if not cron_exp:
            print_error(f"任务[{task.id}]没有设置cron表达式")
            continue
      
        job_id=scheduler.add_cron_job(add_job,cron_expr=cron_exp,args=[get_feeds(task),task],job_id=str(task.id),tag="定时采集")
        print(f"已添加任务: {job_id}, cron表达式: {cron_exp}")
    
    # 检查调度器状态
    status = scheduler.get_scheduler_status()
    print_info(f"调度器状态: running={status['running']}, job_count={status['job_count']}")
    for job_id, next_run_time in status['next_run_times']:
        print_info(f"任务 {job_id} 下次执行时间: {next_run_time}")
    
    if not status['running']:
        scheduler.start()
        print_info("调度器已启动")
    else:
        print_warning("调度器已经在运行中")
def start_all_task():
      #开启自动同步未同步 文章任务
    from jobs.fetch_no_article import start_sync_content
    start_sync_content()
    start_job()
if __name__ == '__main__':
    # do_job()
    # start_all_task()
    pass