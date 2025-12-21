import requests
import json

def send_feishu_message(webhook_url, title, text):
    """
    发送飞书消息（支持多种格式，自动降级）
    
    参数:
    - webhook_url: 飞书机器人 Webhook 地址
    - title: 消息标题
    - text: 消息内容（支持 Markdown 格式）
    """
    # 首先尝试使用富文本 post 格式（支持 Markdown 渲染）
    success = send_feishu_post_message(webhook_url, title, text)
    if success:
        return True
    
    # 如果失败，降级使用文本格式
    return send_feishu_text_message(webhook_url, title, text)


def send_feishu_post_message(webhook_url, title, text):
    """
    发送飞书富文本 post 格式消息（支持 Markdown 渲染）
    
    参数:
    - webhook_url: 飞书机器人 Webhook 地址
    - title: 消息标题
    - text: 消息内容（Markdown 格式）
    
    根据飞书官方文档格式：
    {
        "msg_type": "post",
        "content": {
            "post": {
                "zh_cn": {
                    "title": "标题",
                    "content": [
                        [{"tag": "text", "text": "文本"}, {"tag": "a", "text": "链接", "href": "url"}]
                    ]
                }
            }
        }
    }
    """
    headers = {'Content-Type': 'application/json'}
    import re
    
    # 将文本内容按行分割，每行作为一个段落（content 数组中的一个元素）
    lines = text.split('\n')
    content_blocks = []
    
    for line in lines:
        line = line.strip()
        
        # 跳过空行
        if not line:
            continue
        
        # 处理三级标题 ###
        if line.startswith('###'):
            title_text = line.replace('###', '').strip()
            # 移除加粗标记
            title_text = title_text.replace('**', '')
            # 飞书 post 格式中，标题通过单独的段落和文本内容来区分
            # 根据官方文档，text 标签只支持 text 和 un_escape 字段
            content_blocks.append([{
                "tag": "text",
                "text": title_text
            }])
        # 处理二级标题 ##
        elif line.startswith('##'):
            title_text = line.replace('##', '').strip()
            title_text = title_text.replace('**', '')
            content_blocks.append([{
                "tag": "text",
                "text": title_text
            }])
        # 处理一级标题 #
        elif line.startswith('#'):
            title_text = line.replace('#', '').strip()
            title_text = title_text.replace('**', '')
            content_blocks.append([{
                "tag": "text",
                "text": title_text
            }])
        # 处理列表项（以 - 或 * 开头，通常包含链接）
        elif line.startswith('-') or line.startswith('*'):
            # 移除列表标记
            list_text = line.lstrip('-* ').strip()
            # 处理这一行的内容，可能包含链接和加粗文本
            block_content = parse_line_with_links(list_text)
            if block_content:
                content_blocks.append(block_content)
            else:
                content_blocks.append([{
                    "tag": "text",
                    "text": list_text.replace('**', '')
                }])
        # 处理包含链接的行
        elif '](' in line:
            block_content = parse_line_with_links(line)
            if block_content:
                content_blocks.append(block_content)
            else:
                content_blocks.append([{
                    "tag": "text",
                    "text": line.replace('**', '')
                }])
        else:
            # 普通文本，移除加粗标记
            text_content = line.replace('**', '')
            if text_content:
                content_blocks.append([{
                    "tag": "text",
                    "text": text_content
                }])
    
    # 如果没有内容块，使用原始文本
    if not content_blocks:
        content_blocks = [[{"tag": "text", "text": text.replace('**', '')}]]
    
    # 构建符合飞书 API 格式的数据
    data = {
        "msg_type": "post",
        "content": {
            "post": {
                "zh_cn": {
                    "title": title,
                    "content": content_blocks
                }
            }
        }
    }
    
    # 打印发送的数据以便调试（仅打印结构，不打印完整内容）
    print(f'发送给飞书的数据结构: msg_type={data["msg_type"]}, title={data["content"]["post"]["zh_cn"]["title"]}, content_blocks数量={len(data["content"]["post"]["zh_cn"]["content"])}')
    
    try:
        response = requests.post(
            url=webhook_url,
            headers=headers,
            json=data,
            timeout=10
        )
        response.raise_for_status()
        result = response.json()
        
        # 打印完整响应以便调试
        print(f'飞书API响应: {json.dumps(result, ensure_ascii=False, indent=2)}')
        
        # 检查飞书返回的错误码
        if result.get('code') != 0:
            error_msg = result.get('msg', '未知错误')
            print(f'飞书富文本消息发送失败: {error_msg} (code: {result.get("code")})')
            return False
        else:
            print('飞书富文本消息发送成功')
            return True
    except requests.exceptions.RequestException as e:
        print(f'飞书富文本消息发送失败 (网络错误): {e}')
        if hasattr(e, 'response') and e.response is not None:
            try:
                error_detail = e.response.json()
                print(f'错误详情: {json.dumps(error_detail, ensure_ascii=False, indent=2)}')
            except:
                print(f'响应内容: {e.response.text}')
        return False
    except Exception as e:
        print(f'飞书富文本消息发送失败: {e}')
        import traceback
        traceback.print_exc()
        return False


def parse_line_with_links(line):
    """
    解析包含链接的行，返回飞书 post 格式的内容块
    
    参数:
        line: 包含 Markdown 链接的文本行
        
    返回:
        内容块列表，格式如：[{"tag": "text", "text": "文本"}, {"tag": "a", "text": "链接", "href": "url"}]
    """
    import re
    block_content = []
    
    # 查找所有链接 [text](url)
    links = list(re.finditer(r'\[([^\]]+)\]\(([^\)]+)\)', line))
    
    if not links:
        # 没有链接，返回普通文本
        return [{"tag": "text", "text": line.replace('**', '')}]
    
    last_pos = 0
    for match in links:
        # 添加链接前的文本
        if match.start() > last_pos:
            text_before = line[last_pos:match.start()].strip()
            if text_before:
                # 移除加粗标记
                text_before = text_before.replace('**', '')
                if text_before:
                    block_content.append({
                        "tag": "text",
                        "text": text_before
                    })
        
        # 添加链接
        link_text = match.group(1)
        link_url = match.group(2)
        # 移除链接文本中的加粗标记 **text** -> text
        if link_text.startswith('**') and link_text.endswith('**'):
            link_text = link_text[2:-2]
        block_content.append({
            "tag": "a",
            "text": link_text,
            "href": link_url
        })
        last_pos = match.end()
    
    # 添加链接后的文本（通常是时间等）
    if last_pos < len(line):
        text_after = line[last_pos:].strip()
        if text_after:
            # 移除加粗标记
            text_after = text_after.replace('**', '')
            if text_after:
                block_content.append({
                    "tag": "text",
                    "text": text_after
                })
    
    return block_content if block_content else [{"tag": "text", "text": line.replace('**', '')}]


def send_feishu_text_message(webhook_url, title, text):
    """
    发送飞书文本格式消息
    
    参数:
    - webhook_url: 飞书机器人 Webhook 地址
    - title: 消息标题
    - text: 消息内容
    """
    headers = {'Content-Type': 'application/json'}
    
    # 组合标题和内容
    full_text = f"{title}\n\n{text}" if title else text
    
    # 限制文本长度（飞书文本消息最大长度约 4096 字符）
    if len(full_text) > 4000:
        full_text = full_text[:4000] + "\n\n...(内容过长已截断)"
    
    # 根据飞书官方文档，使用正确的格式
    data = {
        "msg_type": "text",
        "content": {
            "text": full_text
        }
    }
    
    # 打印发送的数据以便调试
    print(f'发送给飞书的数据: msg_type={data["msg_type"]}, text长度={len(data["content"]["text"])}')
    
    try:
        response = requests.post(
            url=webhook_url,
            headers=headers,
            json=data,  # 使用 json 参数而不是 data，确保正确编码
            timeout=10
        )
        response.raise_for_status()
        result = response.json()
        
        # 打印完整响应以便调试
        print(f'飞书API响应: {json.dumps(result, ensure_ascii=False, indent=2)}')
        
        if result.get('code') != 0:
            error_msg = result.get('msg', '未知错误')
            print(f'飞书文本消息发送失败: {error_msg} (code: {result.get("code")})')
            return False
        else:
            print('飞书文本消息发送成功')
            return True
    except requests.exceptions.RequestException as e:
        print(f'飞书文本消息发送失败 (网络错误): {e}')
        if hasattr(e, 'response') and e.response is not None:
            try:
                error_detail = e.response.json()
                print(f'错误详情: {json.dumps(error_detail, ensure_ascii=False, indent=2)}')
            except:
                print(f'响应内容: {e.response.text}')
        return False
    except Exception as e:
        print(f'飞书文本消息发送失败: {e}')
        import traceback
        traceback.print_exc()
        return False