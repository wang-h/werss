import json
import requests
import time
import random
import yaml
import re
from bs4 import BeautifulSoup
from core.wx.base import WxGather
from core.print import print_info
from core.log import logger
# 继承 BaseGather 类
class MpsAppMsg(WxGather):

    # 重写 content_extract 方法
    def content_extract(self,  url):
        try:
            text = super().content_extract(url)
            if text is not None:
                soup = BeautifulSoup(text, 'html.parser')
                # 找到内容
                js_content_div = soup.find('div', {'id': 'js_content'})
                # 移除style属性中的visibility: hidden;
                if js_content_div is None:
                    return ""
                js_content_div.attrs.pop('style', None)
                # 找到所有的img标签
                img_tags = js_content_div.find_all('img')
                
                # 从URL中提取文章ID
                article_id = self._extract_article_id_from_url(url) or "unknown"
                
                # 初始化MinIO客户端
                minio_client = None
                try:
                    from core.storage.minio_client import MinIOClient
                    minio_client = MinIOClient()
                except Exception as e:
                    logger.warning(f"MinIO客户端初始化失败: {e}")
                
                # 遍历每个img标签并处理图片
                for img_tag in img_tags:
                    # 获取图片URL
                    img_url = str(img_tag.get('data-src') or img_tag.get('src') or '')
                    if not img_url:
                        continue
                    
                    # 如果MinIO可用，尝试上传图片
                    minio_url = None
                    if minio_client and minio_client.is_available():
                        minio_url = minio_client.upload_image(img_url, article_id)
                    
                    if minio_url:
                        # 替换为MinIO URL
                        img_tag['src'] = minio_url  # type: ignore
                        if hasattr(img_tag, 'attrs') and 'data-src' in img_tag.attrs:
                            del img_tag['data-src']  # type: ignore
                        logger.info(f"图片已上传到MinIO: {img_url} -> {minio_url}")
                    else:
                        # 如果上传失败，至少确保src可用
                        if hasattr(img_tag, 'attrs') and 'data-src' in img_tag.attrs:
                            img_tag['src'] = img_tag['data-src']  # type: ignore
                            del img_tag['data-src']  # type: ignore
                    
                    # 处理样式
                    if hasattr(img_tag, 'attrs') and 'style' in img_tag.attrs:
                        style = str(img_tag['style'])  # type: ignore
                        # 使用正则表达式替换width属性
                        style = re.sub(r'width\s*:\s*\d+\s*px', 'width: 1080px', style)
                        img_tag['style'] = style  # type: ignore
                return  js_content_div.prettify()
        except Exception as e:
                logger.error(e)
        return ""
    
    def _extract_article_id_from_url(self, url: str) -> str:
        """从URL中提取文章ID"""
        # 例如：https://mp.weixin.qq.com/s/xxxxx -> xxxxx
        if not url:
            return "unknown"
        match = re.search(r'/s/([^/?]+)', str(url))
        if match:
            return match.group(1)
        return "unknown"
    # 重写 get_Articles 方法
    def get_Articles(self, faker_id:str=None,Mps_id:str=None,Mps_title="",CallBack=None,start_page:int=0,MaxPage:int=1,interval=10,Gather_Content=False,Item_Over_CallBack=None,Over_CallBack=None):
        super().Start(mp_id=Mps_id)
        if self.Gather_Content:
            Gather_Content=True
        print(f"APP浏览器模式,是否采集[{Mps_title}]内容：{Gather_Content}\n")
        # 获取采集起始日期
        from datetime import datetime
        collect_start_date = self.get_collect_start_date()
        print_info(f"采集起始日期: {collect_start_date}")
        # 请求参数
        url = "https://mp.weixin.qq.com/cgi-bin/appmsgpublish"
        count=5
        params = {
        "sub": "list",
        "sub_action": "list_ex",
        "begin":start_page,
        "count": count,
        "fakeid": faker_id,
        "token": self.token,
        "lang": "zh_CN",
        "f": "json",
        "ajax": 1
    }
        # 连接超时
        session=self.session
        # 起始页数
        i = start_page
        should_stop_by_date = False
        found_start_date_article = False  # 标记是否找到了起始日期的文章
        while True:
            # 如果达到MaxPage但还没找到起始日期的文章，继续抓取
            if i >= MaxPage and found_start_date_article:
                print_info(f"已达到最大页数 {MaxPage}，且已找到起始日期 {collect_start_date} 的文章，停止抓取")
                break
            # 只有当找到早于起始日期的文章，并且已经找到过在范围内的文章时，才停止
            # 这样可以确保至少抓取到一些在范围内的文章
            if should_stop_by_date and found_start_date_article:
                print_info(f"已抓取到起始日期 {collect_start_date} 之前的文章，且已找到范围内的文章，停止抓取")
                break
            begin = i * count
            params["begin"] = str(begin)
            print(f"第{i+1}页开始爬取\n")
            # 随机暂停几秒，避免过快的请求导致过快的被查到
            time.sleep(random.randint(0,interval))
            try:
                headers = self.fix_header(url)
                resp = session.get(url, headers=headers, params = params, verify=False)
                
                msg = resp.json()
                self._cookies =resp.cookies
                # 流量控制了, 退出
                if msg['base_resp']['ret'] == 200013:
                    super().Error("frequencey control, stop at {}".format(str(begin)))
                    break
                
                if msg['base_resp']['ret'] == 200003:
                    super().Error("Invalid Session, stop at {}".format(str(begin)),code="Invalid Session")
                    break
                if msg['base_resp']['ret'] != 0:
                    super().Error("错误原因:{}:代码:{}".format(msg['base_resp']['err_msg'],msg['base_resp']['ret']),code="Invalid Session")
                    break    
                # 如果返回的内容中为空则结束
                if 'publish_page' not in msg:
                    super().Error("all ariticle parsed")
                    break
                if msg['base_resp']['ret'] != 0:
                    super().Error("错误原因:{}:代码:{}".format(msg['base_resp']['err_msg'],msg['base_resp']['ret']))
                    break  
                if "publish_page" in msg:
                    msg["publish_page"]=json.loads(msg['publish_page'])
                    for item in msg["publish_page"]['publish_list']:
                        if "publish_info" in item:
                            publish_info= json.loads(item['publish_info'])
                       
                            if "appmsgex" in publish_info:
                                # info = '"{}","{}","{}","{}"'.format(str(item["aid"]), item['title'], item['link'], str(item['create_time']))
                                for item in publish_info["appmsgex"]:
                                    # 检查文章发布时间，如果早于起始日期则停止抓取
                                    if 'update_time' in item:
                                        try:
                                            publish_timestamp = int(item['update_time'])
                                            if publish_timestamp < 10000000000:  # 秒级时间戳
                                                publish_timestamp *= 1000
                                            publish_date = datetime.fromtimestamp(publish_timestamp / 1000).date()
                                            # 如果找到了起始日期或之后的文章，标记为已找到
                                            if publish_date >= collect_start_date:
                                                found_start_date_article = True
                                            # 如果文章发布时间早于起始日期，标记需要停止（但只有在已找到范围内文章时才真正停止）
                                            if publish_date < collect_start_date:
                                                should_stop_by_date = True
                                                if found_start_date_article:
                                                    print_info(f"文章发布时间 {publish_date} 早于采集起始日期 {collect_start_date}，且已找到范围内的文章，将在本页处理完后停止抓取")
                                                else:
                                                    print_info(f"文章发布时间 {publish_date} 早于采集起始日期 {collect_start_date}，但尚未找到范围内的文章，继续抓取")
                                                # 不立即 break，继续处理本页的其他文章，以便找到范围内的文章
                                        except (ValueError, TypeError, OSError) as e:
                                            logger.warning(f"解析文章发布时间失败: {e}")
                                    if Gather_Content:
                                        if not super().HasGathered(item["aid"]):
                                            item["content"] = self.content_extract(item['link'])
                                    else:
                                        item["content"] = ""
                                    item["id"] = item["aid"]
                                    item["mp_id"] = Mps_id
                                    if CallBack is not None:
                                        super().FillBack(CallBack=CallBack,data=item,Ext_Data={"mp_title":Mps_title,"mp_id":Mps_id})
                    # 只有当找到早于起始日期的文章，并且已经找到过在范围内的文章时，才停止
                    if should_stop_by_date and found_start_date_article:
                        break
                    print(f"第{i+1}页爬取成功\n")
                # 翻页
                i += 1
            except requests.exceptions.Timeout:
                print("Request timed out")
                break
            except requests.exceptions.RequestException as e:
                print(f"Request error: {e}")
                break
            finally:
                super().Item_Over(item={"mps_id":Mps_id,"mps_title":Mps_title},CallBack=Item_Over_CallBack)
        super().Over(CallBack=Over_CallBack)
        pass