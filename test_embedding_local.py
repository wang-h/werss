#!/usr/bin/env python3
"""
本地测试BigModel Embedding功能
不需要数据库，直接测试API调用
"""
import os
import sys

# 设置环境变量
os.environ['BIGMODEL_API_KEY'] = '647dc2bdc26b463db0fa11932e9a3ff0.eGn237PlXHrFDnwc'
os.environ['BIGMODEL_BASE_URL'] = 'https://open.bigmodel.cn/api/paas/v4'
os.environ['BIGMODEL_EMBEDDING_MODEL'] = 'embedding-3'

# 添加项目路径
sys.path.insert(0, '/Users/hao/Workspace/werss')

def test_bigmodel_api():
    """测试BigModel API"""
    print("=== 测试BigModel Embedding API ===")

    # 直接导入测试
    try:
        from core.embedding.bigmodel import BigModelEmbeddingProvider

        provider = BigModelEmbeddingProvider(
            api_key=os.environ['BIGMODEL_API_KEY'],
            base_url=os.environ['BIGMODEL_BASE_URL'],
            model_name=os.environ['BIGMODEL_EMBEDDING_MODEL'],
            dimensions=None
        )

        print(f"✓ Provider创建成功")
        print(f"  - Provider: {provider.provider_name}")
        print(f"  - Model: {provider.model_name}")
        print(f"  - Base URL: {provider.base_url}")

        # 测试单个文本
        test_texts = ["测试文本", "标签聚类技术"]

        print(f"\n正在测试embedding生成...")
        print(f"输入文本: {test_texts}")

        embeddings = provider.embed_texts(test_texts)

        print(f"\n✓ Embedding生成成功!")
        print(f"  - 数量: {len(embeddings)}")
        print(f"  - 维度: {len(embeddings[0]) if embeddings else 0}")
        print(f"  - 前5个值: {embeddings[0][:5] if embeddings else 'N/A'}")

        return True

    except Exception as e:
        print(f"\n✗ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_embedding_factory():
    """测试embedding工厂函数"""
    print("\n\n=== 测试Embedding工厂函数 ===")

    try:
        from core.embedding.factory import get_embedding_provider

        # 设置环境变量
        os.environ['TAG_CLUSTER_EMBEDDING_PROVIDER'] = 'bigmodel'

        provider = get_embedding_provider()

        print(f"✓ 工厂函数创建provider成功")
        print(f"  - Provider: {provider.provider_name}")
        print(f"  - Model: {provider.model_name}")

        # 测试embedding
        test_text = ["人工智能机器学习深度学习"]
        embeddings = provider.embed_texts(test_text)

        print(f"\n✓ Embedding测试成功!")
        print(f"  - 维度: {len(embeddings[0]) if embeddings else 0}")

        return True

    except Exception as e:
        print(f"\n✗ 工厂函数测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("开始本地BigModel Embedding测试...\n")

    success1 = test_bigmodel_api()
    success2 = test_embedding_factory()

    print("\n" + "="*50)
    if success1 and success2:
        print("✓ 所有测试通过!")
        sys.exit(0)
    else:
        print("✗ 部分测试失败")
        sys.exit(1)
