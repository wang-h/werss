#!/usr/bin/env python3
"""
本地测试标签聚类完整流程
使用模拟数据，不依赖真实数据库
"""
import os
import sys

# 设置环境变量
os.environ['BIGMODEL_API_KEY'] = '647dc2bdc26b463db0fa11932e9a3ff0.eGn237PlXHrFDnwc'
os.environ['BIGMODEL_BASE_URL'] = 'https://open.bigmodel.cn/api/paas/v4'
os.environ['BIGMODEL_EMBEDDING_MODEL'] = 'embedding-3'
os.environ['TAG_CLUSTER_EMBEDDING_PROVIDER'] = 'bigmodel'

# 添加项目路径
sys.path.insert(0, '/Users/hao/Workspace/werss')

def test_embedding_generation():
    """测试1: Embedding生成"""
    print("=" * 60)
    print("测试1: Embedding生成")
    print("=" * 60)

    from core.embedding.factory import get_embedding_provider

    provider = get_embedding_provider()
    print(f"✓ Provider创建成功: {provider.provider_name}")

    # 模拟标签profile文本
    test_profiles = [
        "标签：机器学习\n简介：人工智能和机器学习技术相关内容",
        "标签：深度学习\n简介：深度神经网络、CNN、RNN等深度学习技术",
        "标签：Python编程\n简介：Python语言编程相关教程和实践",
        "标签：数据科学\n简介：数据分析、数据挖掘和机器学习应用",
        "标签：算法设计\n简介：各种算法的设计与实现",
    ]

    print(f"\n正在生成{len(test_profiles)}个标签的embeddings...")

    try:
        embeddings = provider.embed_texts(test_profiles)
        print(f"✓ 成功生成{len(embeddings)}个embeddings")
        print(f"  - 维度: {len(embeddings[0])}")
        print(f"  - 第一个embedding前5个值: {embeddings[0][:5]}")
        return embeddings
    except Exception as e:
        print(f"✗ Embedding生成失败: {e}")
        import traceback
        traceback.print_exc()
        return None

def test_cosine_similarity():
    """测试2: 余弦相似度计算"""
    print("\n" + "=" * 60)
    print("测试2: 余弦相似度计算")
    print("=" * 60)

    import math

    def cosine_similarity(v1, v2):
        if not v1 or not v2 or len(v1) != len(v2):
            return 0.0
        dot = sum(a * b for a, b in zip(v1, v2))
        norm1 = math.sqrt(sum(a * a for a in v1))
        norm2 = math.sqrt(sum(b * b for b in v2))
        if norm1 == 0 or norm2 == 0:
            return 0.0
        return dot / (norm1 * norm2)

    # 获取embeddings
    embeddings = test_embedding_generation()
    if not embeddings:
        return False

    print(f"\n计算标签间相似度:")

    tag_names = ["机器学习", "深度学习", "Python编程", "数据科学", "算法设计"]

    for i in range(len(embeddings)):
        for j in range(i + 1, len(embeddings)):
            similarity = cosine_similarity(embeddings[i], embeddings[j])
            print(f"  {tag_names[i]} <-> {tag_names[j]}: {similarity:.4f}")

    print(f"\n✓ 相似度计算完成")
    return True

def test_clustering_algorithm():
    """测试3: 简单聚类算法"""
    print("\n" + "=" * 60)
    print("测试3: 简单聚类算法")
    print("=" * 60)

    import math
    from collections import defaultdict

    def cosine_similarity(v1, v2):
        if not v1 or not v2 or len(v1) != len(v2):
            return 0.0
        dot = sum(a * b for a, b in zip(v1, v2))
        norm1 = math.sqrt(sum(a * a for a in v1))
        norm2 = math.sqrt(sum(b * b for b in v2))
        if norm1 == 0 or norm2 == 0:
            return 0.0
        return dot / (norm1 * norm2)

    # 获取embeddings
    from core.embedding.factory import get_embedding_provider
    provider = get_embedding_provider()

    test_profiles = [
        "标签：机器学习\n简介：人工智能和机器学习技术",
        "标签：深度学习\n简介：深度神经网络技术",
        "标签：Python编程\n简介：Python语言编程",
        "标签：前端开发\n简介：HTML、CSS、JavaScript",
        "标签：后端开发\n简介：服务器端编程技术",
    ]

    tag_names = ["机器学习", "深度学习", "Python编程", "前端开发", "后端开发"]

    try:
        embeddings = provider.embed_texts(test_profiles)
    except Exception as e:
        print(f"✗ Embedding生成失败: {e}")
        return False

    # 计算相似度矩阵
    threshold = 0.75  # 相似度阈值
    adjacency = defaultdict(set)

    print(f"\n构建相似度图 (阈值={threshold}):")
    for i in range(len(embeddings)):
        for j in range(i + 1, len(embeddings)):
            similarity = cosine_similarity(embeddings[i], embeddings[j])
            if similarity >= threshold:
                adjacency[i].add(j)
                adjacency[j].add(i)
                print(f"  {tag_names[i]} <-> {tag_names[j]}: {similarity:.4f} ✓")

    # 找连通分量（聚类）
    visited = set()
    clusters = []

    for i in range(len(embeddings)):
        if i in visited:
            continue
        stack = [i]
        component = []
        visited.add(i)
        while stack:
            node = stack.pop()
            component.append(node)
            for neighbor in adjacency.get(node, set()):
                if neighbor not in visited:
                    visited.add(neighbor)
                    stack.append(neighbor)
        clusters.append(component)

    print(f"\n发现{len(clusters)}个聚类:")
    for i, cluster in enumerate(clusters, 1):
        cluster_tags = [tag_names[idx] for idx in cluster]
        print(f"  聚类{i}: {', '.join(cluster_tags)}")

    print(f"\n✓ 聚类算法测试完成")
    return True

def test_error_handling():
    """测试4: 错误处理"""
    print("\n" + "=" * 60)
    print("测试4: 错误处理")
    print("=" * 60)

    from core.embedding.bigmodel import BigModelEmbeddingProvider

    # 测试空输入
    provider = BigModelEmbeddingProvider(
        api_key=os.environ['BIGMODEL_API_KEY'],
        base_url=os.environ['BIGMODEL_BASE_URL'],
        model_name=os.environ['BIGMODEL_EMBEDDING_MODEL']
    )

    result = provider.embed_texts([])
    print(f"✓ 空输入处理正确: {result}")

    # 测试无效API密钥
    try:
        invalid_provider = BigModelEmbeddingProvider(
            api_key="invalid_key",
            base_url=os.environ['BIGMODEL_BASE_URL'],
            model_name=os.environ['BIGMODEL_EMBEDDING_MODEL']
        )
        invalid_provider.embed_texts(["测试"])
        print(f"✗ 无效密钥未抛出异常")
        return False
    except Exception as e:
        print(f"✓ 无效密钥正确抛出异常: {type(e).__name__}")

    return True

if __name__ == "__main__":
    print("开始标签聚类本地测试...\n")

    results = []

    # 运行所有测试
    results.append(("Embedding生成", "embeddings" in str(test_embedding_generation())))
    results.append(("余弦相似度", test_cosine_similarity()))
    results.append(("聚类算法", test_clustering_algorithm()))
    results.append(("错误处理", test_error_handling()))

    # 总结
    print("\n" + "=" * 60)
    print("测试总结")
    print("=" * 60)

    for name, success in results:
        status = "✓ 通过" if success else "✗ 失败"
        print(f"{status} - {name}")

    all_passed = all(success for _, success in results)

    if all_passed:
        print(f"\n✓ 所有测试通过!")
        sys.exit(0)
    else:
        print(f"\n✗ 部分测试失败")
        sys.exit(1)
