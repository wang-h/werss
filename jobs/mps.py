from datetime import datetime, date
from core.models.article import Article
from .article import UpdateArticle,Update_Over
import core.db as db
from core.wx import WxGather
from core.log import logger
from core.task import TaskScheduler
from core.models.feed import Feed
from core.config import cfg,DEBUG
from core.print import print_info,print_success,print_error
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
def do_job(mp=None,task:MessageTask=None):
        # TaskQueue.add_task(test,info=datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        # print("执行任务", task.mps_id)
        print("执行任务")
        all_count=0
        wx=WxGather().Model()
        try:
            # 计算从月初到现在需要抓取的页数
            max_pages = calculate_pages_from_month_start()
            print_info(f"从月初开始抓取，预计抓取 {max_pages} 页")
            wx.get_Articles(mp.faker_id,CallBack=UpdateArticle,Mps_id=mp.id,Mps_title=mp.mp_name, MaxPage=max_pages,Over_CallBack=Update_Over,interval=interval)
        except Exception as e:
            print_error(e)
            # raise
        finally:
            count=wx.all_count()
            all_count+=count
            from jobs.webhook import MessageWebHook 
            tms=MessageWebHook(task=task,feed=mp,articles=wx.articles)
            web_hook(tms)
            print_success(f"任务({task.id})[{mp.mp_name}]执行成功,{count}成功条数")

from core.queue import TaskQueue
def add_job(feeds:list[Feed]=None,task:MessageTask=None,isTest=False):
    if isTest:
        TaskQueue.clear_queue()
    for feed in feeds:
        TaskQueue.add_task(do_job,feed,task)
        if isTest:
            print(f"测试任务，{feed.mp_name}，加入队列成功")
            reload_job()
            break
        print(f"{feed.mp_name}，加入队列成功")
    print_success(TaskQueue.get_queue_info())
    pass
import json
def get_feeds(task:MessageTask=None):
     mps = json.loads(task.mps_id)
     ids=",".join([item["id"]for item in mps])
     mps=wx_db.get_mps_list(ids)
     if len(mps)==0:
        mps=wx_db.get_all_mps()
     return mps
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
            from core.print import print_warning
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
        print(f"已添加任务: {job_id}")
    scheduler.start()
    print("启动任务")
def start_all_task():
      #开启自动同步未同步 文章任务
    from jobs.fetch_no_article import start_sync_content
    start_sync_content()
    start_job()
if __name__ == '__main__':
    # do_job()
    # start_all_task()
    pass