#!/usr/bin/env python3
"""
通过 API 从数据库读取真实文章，测试不同关键词提取方法的效果对比
比较：TextRank、KeyBERT（混合方案）、AI（DeepSeek）

默认登录凭据（首次运行需要初始化数据库）：
    用户名: admin
    密码: admin@123
    
    初始化数据库命令: python main.py -init True

使用方法：
    python scripts/test_keyword_from_db_api.py
    python scripts/test_keyword_from_db_api.py --limit 3
    python scripts/test_keyword_from_db_api.py --methods textrank,keybert-hybrid
    python scripts/test_keyword_from_db_api.py --username 你的用户名 --password 你的密码
    python scripts/test_keyword_from_db_api.py --token YOUR_TOKEN
"""
import requests
import json
import sys
import argparse
from typing import Dict, List, Optional
from core.tag_extractor import get_tag_extractor

def print_section(title: str):
    """打印分隔线"""
    print("\n" + "=" * 80)
    print(f" {title}")
    print("=" * 80)

def truncate_text(text: str, max_len: int = 100) -> str:
    """截断文本用于显示"""
    if not text:
        return ""
    if len(text) <= max_len:
        return text
    return text[:max_len] + "..."

def login(base_url: str, username: str, password: str) -> Optional[str]:
    """登录获取 token"""
    try:
        # 使用 OAuth2PasswordRequestForm 格式（表单数据）
        login_resp = requests.post(
            f"{base_url}/auth/login",
            data={
                "username": username,
                "password": password
            },
            timeout=10
        )
        
        if login_resp.status_code == 200:
            login_result = login_resp.json()
            # API 返回格式: {"code": 0, "data": {"access_token": "...", ...}} 或 {"code": 200, ...}
            if login_result.get('code') == 200 or login_result.get('code') == 0:
                data = login_result.get('data', {})
                # 优先查找 access_token
                if 'access_token' in data:
                    return data['access_token']
                # 兼容其他可能的字段名
                elif 'token' in data:
                    return data['token']
            # 兼容直接返回 token 的情况
            elif 'access_token' in login_result:
                return login_result['access_token']
            elif 'token' in login_result:
                return login_result['token']
        
        # 打印错误信息以便调试
        if login_resp.status_code != 200:
            print(f"⚠️  登录失败: HTTP {login_resp.status_code}")
            try:
                error_info = login_resp.json()
                print(f"   错误信息: {error_info}")
            except:
                print(f"   响应内容: {login_resp.text[:200]}")
        
        return None
    except requests.exceptions.ConnectionError:
        print(f"⚠️  连接失败: 请确保服务正在运行在 {base_url}")
        return None
    except Exception as e:
        print(f"⚠️  登录异常: {e}")
        import traceback
        traceback.print_exc()
        return None

def get_articles(base_url: str, token: str, limit: int = 5, has_content: bool = True) -> List[Dict]:
    """通过 API 获取文章列表"""
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {token}'
    }
    
    try:
        resp = requests.get(
            f"{base_url}/articles",
            params={
                "offset": 0,
                "limit": limit,
                "has_content": has_content
            },
            headers=headers,
            timeout=10
        )
        
        if resp.status_code == 200:
            result = resp.json()
            # API 返回格式: {"code": 0, "message": "success", "data": {"list": [...], "total": ...}}
            if result.get('code') == 200 or result.get('code') == 0:
                return result.get('data', {}).get('list', [])
            else:
                print(f"❌ API错误: {result.get('message', '未知错误')}")
                print(f"   返回码: {result.get('code')}")
                return []
        else:
            print(f"❌ HTTP错误: {resp.status_code}")
            print(f"   响应: {resp.text[:200]}")
            return []
    except requests.exceptions.ConnectionError:
        print(f"❌ 连接失败: 请确保服务正在运行")
        return []
    except Exception as e:
        print(f"❌ 异常: {e}")
        return []

def get_article_detail(base_url: str, token: str, article_id: str) -> Optional[Dict]:
    """通过 API 获取文章详情（包含完整内容）"""
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {token}'
    }
    
    try:
        resp = requests.get(
            f"{base_url}/articles/{article_id}",
            params={"content": True},
            headers=headers,
            timeout=10
        )
        
        if resp.status_code == 200:
            result = resp.json()
            # API 返回格式: {"code": 0, "message": "success", "data": {...}}
            if result.get('code') == 200 or result.get('code') == 0:
                return result.get('data')
            else:
                print(f"❌ API错误: {result.get('message', '未知错误')}")
                print(f"   返回码: {result.get('code')}")
                return None
        else:
            print(f"❌ HTTP错误: {resp.status_code}")
            return None
    except Exception as e:
        print(f"❌ 异常: {e}")
        return None

def test_extract_keywords(base_url: str, token: str, title: str, description: str = "", content: str = "", method: str = "textrank", topK: int = 5) -> List[str]:
    """通过 API 测试关键词提取"""
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {token}'
    }
    
    test_data = {
        "title": title,
        "description": description,
        "content": content,
        "method": method,
        "topK": topK
    }
    
    # 添加调试信息
    if not title and not content:
        print(f"   ⚠️  警告: 标题和内容都为空，可能无法提取关键词")
    
    try:
        resp = requests.post(
            f"{base_url}/tags/test/extract",
            json=test_data,
            headers=headers,
            timeout=60  # AI 提取可能需要较长时间
        )
        
        if resp.status_code == 200:
            result = resp.json()
            # API 返回格式: {"code": 0, "message": "success", "data": {"keywords": [...]}}
            if result.get('code') == 200 or result.get('code') == 0:
                data = result.get('data', {})
                keywords = data.get('keywords', [])
                # 添加调试信息
                if not keywords:
                    print(f"   ⚠️  未提取到关键词（方法: {method}）")
                    print(f"      返回数据: {data}")
                return keywords
            else:
                print(f"   ❌ API错误: {result.get('message', '未知错误')}")
                print(f"      返回码: {result.get('code')}")
                print(f"      完整响应: {result}")
                return []
        else:
            print(f"   ❌ HTTP错误: {resp.status_code}")
            print(f"   响应: {resp.text[:500]}")
            return []
    except requests.exceptions.Timeout:
        print(f"   ⏱️  超时: {method} 方法执行时间过长")
        return []
    except Exception as e:
        print(f"   ❌ 异常: {e}")
        return []

def test_articles_from_api(
    base_url: str,
    token: str,
    limit: int = 5,
    methods: List[str] = None
):
    """从 API 读取文章并测试提取方法"""
    
    if methods is None:
        methods = ["textrank", "keybert", "keybert-hybrid", "ai"]
    
    # 获取标签提取器实例（用于 HTML 转文本）
    extractor = get_tag_extractor()
    
    # 获取文章列表
    print_section(f"从 API 读取文章列表（限制 {limit} 篇）")
    articles = get_articles(base_url, token, limit=limit, has_content=True)
    
    if not articles:
        print("❌ 没有获取到文章")
        return
    
    print(f"✅ 成功获取 {len(articles)} 篇文章")
    
    for i, article in enumerate(articles, 1):
        article_id = article.get('id')
        title = article.get('title', '')
        description = article.get('description', '')
        content = article.get('content', '')
        
        # 如果内容为空，尝试获取详情
        if not content:
            print(f"\n📄 文章 {i} 内容为空，尝试获取详情...")
            article_detail = get_article_detail(base_url, token, article_id)
            if article_detail:
                content = article_detail.get('content', '')
        
        print_section(f"文章 {i}/{len(articles)}: {truncate_text(title, 60)}")
        
        # 显示文章基本信息
        print(f"\n📄 标题: {title}")
        if description:
            # 将 HTML 转换为纯文本用于显示
            description_text = extractor._html_to_text(description, to_markdown=False)
            print(f"📝 描述: {truncate_text(description_text, 150)}")
        else:
            print(f"📝 描述: (空)")
        if content:
            # 将 HTML 转换为纯文本用于显示预览
            content_text = extractor._html_to_text(content, to_markdown=False)
            content_preview = truncate_text(content_text, 200)
            print(f"📄 内容预览: {content_preview}")
            print(f"📏 内容长度: {len(content)} 字符")
        else:
            print(f"📄 内容: (空)")
        print(f"🆔 文章ID: {article_id}")
        
        results = {}
        
        # 测试各种提取方法
        for method in methods:
            method_name = {
                "textrank": "TextRank（jieba）",
                "keybert": "KeyBERT（标准方案）",
                "keybert-hybrid": "KeyBERT（混合方案，推荐）",
                "ai": "AI（DeepSeek API）"
            }.get(method, method.upper())
            
            print(f"\n📊 方法: {method_name}")
            try:
                keywords = test_extract_keywords(
                    base_url, token, title, description, content, method=method, topK=5
                )
                results[method] = keywords
                print(f"   关键词 ({len(keywords)}个): {keywords}")
            except Exception as e:
                print(f"   ❌ 失败: {e}")
                results[method] = []
        
        # 对比分析
        print_section("对比分析")
        print("\n方法对比：")
        print(f"{'方法':<25} {'关键词数量':<12} {'关键词'}")
        print("-" * 100)
        for method, keywords in results.items():
            method_name = {
                "textrank": "TextRank",
                "keybert": "KeyBERT-标准",
                "keybert-hybrid": "KeyBERT-混合",
                "ai": "AI-DeepSeek"
            }.get(method, method.upper())
            
            count = len(keywords)
            keywords_str = ", ".join(keywords) if keywords else "无"
            # 如果关键词太长，截断显示
            if len(keywords_str) > 70:
                keywords_str = keywords_str[:70] + "..."
            print(f"{method_name:<25} {count:<12} {keywords_str}")
        
        # 质量评估
        print("\n质量评估：")
        # 常见的不合适模式
        bad_patterns = [
            '行代码', '行代码能干', '代码能干', '能干', 
            '伟达', '阳谋', '建议', '发布', '宣布',
            '团队成', '蚂蚁集团'  # 用户提到的问题
        ]
        
        for method, keywords in results.items():
            if not keywords:
                method_name = {
                    "textrank": "TextRank",
                    "keybert": "KeyBERT-标准",
                    "keybert-hybrid": "KeyBERT-混合",
                    "ai": "AI-DeepSeek"
                }.get(method, method.upper())
                print(f"  {method_name:<25} ⚠️  未提取到关键词")
                continue
            
            bad_keywords = [kw for kw in keywords if any(pattern in kw for pattern in bad_patterns)]
            method_name = {
                "textrank": "TextRank",
                "keybert": "KeyBERT-标准",
                "keybert-hybrid": "KeyBERT-混合",
                "ai": "AI-DeepSeek"
            }.get(method, method.upper())
            
            if bad_keywords:
                print(f"  {method_name:<25} ⚠️  发现不合适的关键词: {bad_keywords}")
            else:
                print(f"  {method_name:<25} ✅ 质量良好")
        
        # 提取唯一关键词（所有方法的并集）
        all_keywords = set()
        for keywords in results.values():
            all_keywords.update(keywords)
        
        print(f"\n📌 所有方法提取的唯一关键词（共{len(all_keywords)}个）:")
        print(f"   {', '.join(sorted(all_keywords))}")
        
        print("\n" + "-" * 80)
    
    # 总结
    print_section("总结")
    print("\n各方法特点：")
    print("\n1. TextRank（jieba）:")
    print("   ✅ 优点: 轻量级，速度快，无需额外依赖")
    print("   ⚠️  缺点: 可能出现不完整片段（如'行代码'、'团队成'）")
    print("   💾 内存: ~50MB")
    print("   ⚡ 速度: 很快")
    
    print("\n2. KeyBERT + Model2Vec（混合方案）:")
    print("   ✅ 优点: CPU友好，中文支持好，质量较高")
    print("   ⚠️  缺点: 需要安装额外依赖，首次加载需要下载模型")
    print("   💾 内存: ~200-300MB")
    print("   ⚡ 速度: 快（CPU上很快）")
    
    print("\n3. AI（DeepSeek）:")
    print("   ✅ 优点: 质量最好，语义理解强，能提取具体实体")
    print("   ⚠️  缺点: 需要API调用，有成本，速度较慢")
    print("   💾 内存: 无（API调用）")
    print("   ⚡ 速度: 较慢（网络延迟）")
    print("   💰 成本: 按API调用计费")

def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="通过 API 从数据库读取文章测试关键词提取")
    parser.add_argument(
        "--limit",
        type=int,
        default=5,
        help="测试的文章数量（默认：5）"
    )
    parser.add_argument(
        "--base-url",
        type=str,
        default="http://localhost:8001/api/v1/wx",
        help="API 基础 URL（默认：http://localhost:8001/api/v1/wx）\n"
             "注意：如果只提供 http://localhost:8001，脚本会自动添加 /api/v1/wx 前缀"
    )
    parser.add_argument(
        "--token",
        type=str,
        default=None,
        help="直接提供 token（可选，如果不提供会自动登录）"
    )
    parser.add_argument(
        "--username",
        type=str,
        default="admin",
        help="登录用户名（默认：admin）"
    )
    parser.add_argument(
        "--password",
        type=str,
        default="admin@123",
        help="登录密码（默认：admin@123）"
    )
    parser.add_argument(
        "--methods",
        type=str,
        default="textrank,keybert,keybert-hybrid,ai",
        help="要测试的方法，逗号分隔（默认：textrank,keybert,keybert-hybrid,ai）"
    )
    
    args = parser.parse_args()
    
    # 自动补全 API 基础路径
    base_url = args.base_url.rstrip('/')
    if not base_url.endswith('/api/v1/wx'):
        # 如果只提供了基础地址（如 http://localhost:8001），自动添加 API 路径
        if not base_url.endswith('/api'):
            base_url = f"{base_url}/api/v1/wx"
        elif not base_url.endswith('/api/v1'):
            base_url = f"{base_url}/v1/wx"
        elif not base_url.endswith('/api/v1/wx'):
            base_url = f"{base_url}/wx"
    
    # 解析方法列表
    methods = [m.strip() for m in args.methods.split(",") if m.strip()]
    
    # 获取 token
    token = args.token
    if not token:
        print(f"尝试登录获取 token...")
        print(f"  API地址: {base_url}")
        print(f"  用户名: {args.username}")
        token = login(base_url, args.username, args.password)
        if token:
            print("✅ 登录成功")
            print(f"  Token: {token[:20]}...")
        else:
            print("\n❌ 登录失败")
            print("\n可能的解决方案：")
            print("1. 检查服务是否正在运行")
            print(f"   curl {base_url}/auth/login")
            print("2. 检查是否已初始化数据库和创建用户")
            print("   运行: python main.py -init True")
            print("   默认用户名: admin")
            print("   默认密码: admin@123")
            print("   可通过环境变量自定义: export USERNAME=你的用户名 && export PASSWORD=你的密码")
            print(f"3. 检查用户名和密码是否正确")
            print(f"   当前使用: --username {args.username} --password {args.password}")
            print("4. 如果知道 token，可以直接使用 --token 参数")
            print("   例如: python scripts/test_keyword_from_db_api.py --token YOUR_TOKEN")
            print("5. 使用浏览器登录后，从开发者工具 Network 标签中获取 token")
            print("   在请求头中找到: Authorization: Bearer YOUR_TOKEN")
            sys.exit(1)
    
    # 执行测试
    test_articles_from_api(
        base_url=base_url,
        token=token,
        limit=args.limit,
        methods=methods
    )

if __name__ == "__main__":
    main()
