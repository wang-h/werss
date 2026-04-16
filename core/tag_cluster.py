import hashlib
import math
import os
import uuid
from collections import defaultdict
from datetime import datetime
from difflib import SequenceMatcher
from typing import Any, Dict, List, Tuple

from sqlalchemy.orm import Session

from core.embedding import get_embedding_provider
from core.models.article import Article
from core.models.article_tags import ArticleTag
from core.models.tag_cluster_members import TagClusterMember
from core.models.tag_clusters import TagCluster
from core.models.tag_embeddings import TagEmbedding
from core.models.tag_profiles import TagProfile
from core.models.tag_similarities import TagSimilarity
from core.models.tags import Tags


def _get_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)).strip())
    except ValueError:
        return default


def _get_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)).strip())
    except ValueError:
        return default


def _profile_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _cosine_similarity(v1: List[float], v2: List[float]) -> float:
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return dot / (norm1 * norm2)


def _lexical_similarity(name1: str, name2: str) -> float:
    if not name1 or not name2:
        return 0.0
    if name1 == name2:
        return 1.0
    ratio = SequenceMatcher(None, name1, name2).ratio()
    if name1 in name2 or name2 in name1:
        ratio = max(ratio, 0.9)
    return ratio


def _cooccurrence_similarity(article_ids_1: set[str], article_ids_2: set[str]) -> float:
    if not article_ids_1 or not article_ids_2:
        return 0.0
    union = article_ids_1 | article_ids_2
    if not union:
        return 0.0
    return len(article_ids_1 & article_ids_2) / len(union)


def _score_to_int(value: float) -> int:
    return max(0, min(10000, int(round(value * 10000))))


def build_tag_profiles(db: Session) -> Dict[str, Dict[str, Any]]:
    min_article_count = _get_int("TAG_CLUSTER_MIN_ARTICLE_COUNT", 3)
    sample_article_limit = _get_int("TAG_CLUSTER_SAMPLE_ARTICLE_LIMIT", 10)
    co_tag_limit = _get_int("TAG_CLUSTER_CO_TAG_LIMIT", 8)

    tags = db.query(Tags).all()
    tag_map = {tag.id: tag for tag in tags}

    article_tag_rows = db.query(ArticleTag.article_id, ArticleTag.tag_id).all()
    tag_to_article_ids: dict[str, set[str]] = defaultdict(set)
    article_to_tag_ids: dict[str, set[str]] = defaultdict(set)
    for article_id, tag_id in article_tag_rows:
        tag_to_article_ids[tag_id].add(article_id)
        article_to_tag_ids[article_id].add(tag_id)

    eligible_tag_ids = [
        tag_id for tag_id, article_ids in tag_to_article_ids.items()
        if len(article_ids) >= min_article_count and tag_id in tag_map
    ]

    all_article_ids = set()
    for tag_id in eligible_tag_ids:
        all_article_ids.update(tag_to_article_ids[tag_id])

    article_rows = []
    if all_article_ids:
        article_rows = (
            db.query(Article.id, Article.title, Article.description, Article.publish_time)
            .filter(Article.id.in_(list(all_article_ids)))
            .all()
        )
    article_map = {
        article_id: {
            "title": title or "",
            "description": description or "",
            "publish_time": publish_time or 0,
        }
        for article_id, title, description, publish_time in article_rows
    }

    existing_profiles = {
        row.tag_id: row
        for row in db.query(TagProfile).filter(TagProfile.tag_id.in_(eligible_tag_ids)).all()
    } if eligible_tag_ids else {}

    profile_payloads: Dict[str, Dict[str, Any]] = {}
    now = datetime.now()
    for tag_id in eligible_tag_ids:
        tag = tag_map[tag_id]
        article_ids = list(tag_to_article_ids[tag_id])
        sorted_articles = sorted(
            [article_map[aid] | {"id": aid} for aid in article_ids if aid in article_map],
            key=lambda item: item.get("publish_time", 0),
            reverse=True,
        )[:sample_article_limit]

        sample_titles = [item["title"] for item in sorted_articles if item.get("title")]
        sample_descriptions = [item["description"][:180] for item in sorted_articles if item.get("description")]

        co_tag_counter: dict[str, int] = defaultdict(int)
        for article_id in article_ids:
            for co_tag_id in article_to_tag_ids.get(article_id, set()):
                if co_tag_id != tag_id and co_tag_id in tag_map:
                    co_tag_counter[co_tag_id] += 1

        co_tags = [
            {
                "tag_id": co_tag_id,
                "name": tag_map[co_tag_id].name,
                "count": count,
            }
            for co_tag_id, count in sorted(co_tag_counter.items(), key=lambda item: item[1], reverse=True)[:co_tag_limit]
        ]

        profile_parts = [
            f"标签：{tag.name or ''}",
            f"简介：{tag.intro or ''}",
        ]
        if sample_titles:
            profile_parts.append("相关文章标题：\n- " + "\n- ".join(sample_titles))
        if sample_descriptions:
            profile_parts.append("相关文章摘要：\n- " + "\n- ".join(sample_descriptions))
        if co_tags:
            profile_parts.append("共现标签：\n- " + "\n- ".join(item["name"] for item in co_tags if item["name"]))

        profile_text = "\n".join(part for part in profile_parts if part and part.strip())
        profile_hash = _profile_hash(profile_text)

        existing = existing_profiles.get(tag_id)
        if existing:
            existing.profile_text = profile_text
            existing.profile_hash = profile_hash
            existing.article_count = len(article_ids)
            existing.sample_titles = sample_titles
            existing.co_tags = co_tags
            existing.updated_at = now
        else:
            db.add(
                TagProfile(
                    tag_id=tag_id,
                    profile_text=profile_text,
                    profile_hash=profile_hash,
                    article_count=len(article_ids),
                    sample_titles=sample_titles,
                    co_tags=co_tags,
                    updated_at=now,
                )
            )

        profile_payloads[tag_id] = {
            "tag": tag,
            "article_ids": set(article_ids),
            "profile_text": profile_text,
            "profile_hash": profile_hash,
            "sample_titles": sample_titles,
            "co_tags": co_tags,
        }

    db.commit()
    return profile_payloads


def build_tag_embeddings(db: Session, profile_payloads: Dict[str, Dict[str, Any]]) -> Dict[str, TagEmbedding]:
    if not profile_payloads:
        return {}

    provider = get_embedding_provider()
    now = datetime.now()
    tag_ids = list(profile_payloads.keys())

    existing_rows = db.query(TagEmbedding).filter(TagEmbedding.tag_id.in_(tag_ids)).all()
    existing_map = {
        row.tag_id: row
        for row in existing_rows
        if row.embedding_provider == provider.provider_name
        and row.embedding_model == provider.model_name
        and row.embedding_dimensions == provider.dimensions
    }

    result_map: Dict[str, TagEmbedding] = {}
    pending: List[Tuple[str, str, str]] = []
    for tag_id, payload in profile_payloads.items():
        existing = existing_map.get(tag_id)
        if existing and existing.profile_hash == payload["profile_hash"]:
            result_map[tag_id] = existing
        else:
            pending.append((tag_id, payload["profile_text"], payload["profile_hash"]))

    batch_size = _get_int("TAG_CLUSTER_REBUILD_BATCH_SIZE", 100)
    for offset in range(0, len(pending), batch_size):
        batch = pending[offset: offset + batch_size]
        vectors = provider.embed_texts([item[1] for item in batch])
        if len(vectors) != len(batch):
            raise ValueError(f"embedding 返回数量异常: expected={len(batch)}, actual={len(vectors)}")
        for (tag_id, _, profile_hash), vector in zip(batch, vectors):
            existing = existing_map.get(tag_id)
            if existing:
                existing.profile_hash = profile_hash
                existing.vector = vector
                existing.updated_at = now
                result_map[tag_id] = existing
            else:
                row = TagEmbedding(
                    id=str(uuid.uuid4()),
                    tag_id=tag_id,
                    embedding_provider=provider.provider_name,
                    embedding_model=provider.model_name,
                    embedding_dimensions=provider.dimensions,
                    profile_hash=profile_hash,
                    vector=vector,
                    updated_at=now,
                )
                db.add(row)
                result_map[tag_id] = row

    db.commit()
    return result_map


def rebuild_tag_clusters(db: Session) -> Dict[str, Any]:
    profile_payloads = build_tag_profiles(db)
    if not profile_payloads:
        return {
            "tag_count": 0,
            "cluster_count": 0,
            "similarity_count": 0,
            "message": "没有满足条件的标签",
        }

    provider = get_embedding_provider()
    embedding_rows = build_tag_embeddings(db, profile_payloads)
    tag_ids = list(profile_payloads.keys())
    tag_names = {tag_id: payload["tag"].name or "" for tag_id, payload in profile_payloads.items()}
    vectors = {tag_id: (embedding_rows[tag_id].vector if tag_id in embedding_rows else []) for tag_id in tag_ids}

    max_similar_tags = _get_int("TAG_CLUSTER_MAX_SIMILAR_TAGS", 10)
    threshold = _get_float("TAG_CLUSTER_SIMILARITY_THRESHOLD", 0.72)
    version = datetime.now().strftime("%Y%m%d%H%M%S")

    similarities_by_tag: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for i, tag_id in enumerate(tag_ids):
        for j in range(i + 1, len(tag_ids)):
            other_id = tag_ids[j]
            embedding_score = _cosine_similarity(vectors.get(tag_id, []), vectors.get(other_id, []))
            cooccurrence_score = _cooccurrence_similarity(
                profile_payloads[tag_id]["article_ids"],
                profile_payloads[other_id]["article_ids"],
            )
            lexical_score = _lexical_similarity(tag_names[tag_id], tag_names[other_id])
            score = 0.6 * embedding_score + 0.25 * cooccurrence_score + 0.15 * lexical_score
            if score < threshold:
                continue

            similarities_by_tag[tag_id].append({
                "tag_id": tag_id,
                "similar_tag_id": other_id,
                "score": score,
                "embedding_score": embedding_score,
                "cooccurrence_score": cooccurrence_score,
                "lexical_score": lexical_score,
            })
            similarities_by_tag[other_id].append({
                "tag_id": other_id,
                "similar_tag_id": tag_id,
                "score": score,
                "embedding_score": embedding_score,
                "cooccurrence_score": cooccurrence_score,
                "lexical_score": lexical_score,
            })

    db.query(TagSimilarity).delete()
    db.query(TagClusterMember).delete()
    db.query(TagCluster).delete()
    db.commit()

    similarity_rows = 0
    for tag_id, items in similarities_by_tag.items():
        items.sort(key=lambda item: item["score"], reverse=True)
        for item in items[:max_similar_tags]:
            db.add(
                TagSimilarity(
                    id=str(uuid.uuid4()),
                    tag_id=item["tag_id"],
                    similar_tag_id=item["similar_tag_id"],
                    score=_score_to_int(item["score"]),
                    embedding_score=_score_to_int(item["embedding_score"]),
                    cooccurrence_score=_score_to_int(item["cooccurrence_score"]),
                    lexical_score=_score_to_int(item["lexical_score"]),
                    cluster_version=version,
                    updated_at=datetime.now(),
                )
            )
            similarity_rows += 1

    adjacency: dict[str, set[str]] = {tag_id: set() for tag_id in tag_ids}
    for tag_id, items in similarities_by_tag.items():
        for item in items:
            adjacency[tag_id].add(item["similar_tag_id"])

    visited: set[str] = set()
    cluster_count = 0
    for tag_id in tag_ids:
        if tag_id in visited:
            continue
        stack = [tag_id]
        component = []
        visited.add(tag_id)
        while stack:
            current = stack.pop()
            component.append(current)
            for neighbor in adjacency.get(current, set()):
                if neighbor not in visited:
                    visited.add(neighbor)
                    stack.append(neighbor)

        component_scores: dict[str, float] = {}
        for member in component:
            scores = [item["score"] for item in similarities_by_tag.get(member, []) if item["similar_tag_id"] in component]
            component_scores[member] = sum(scores) / len(scores) if scores else 0.0

        centroid_tag_id = max(component_scores, key=lambda key: component_scores[key])
        cluster_id = str(uuid.uuid4())
        cluster_name = tag_names.get(centroid_tag_id) or f"Cluster {cluster_count + 1}"

        db.add(
            TagCluster(
                id=cluster_id,
                name=cluster_name,
                description=f"由 {cluster_name} 等 {len(component)} 个标签组成的语义簇",
                centroid_tag_id=centroid_tag_id,
                size=len(component),
                cluster_version=version,
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
        )
        cluster_count += 1

        for member in sorted(component, key=lambda member_id: component_scores[member_id], reverse=True):
            db.add(
                TagClusterMember(
                    id=str(uuid.uuid4()),
                    cluster_id=cluster_id,
                    tag_id=member,
                    member_score=_score_to_int(component_scores[member]),
                    cluster_version=version,
                    created_at=datetime.now(),
                )
            )

    db.commit()
    return {
        "tag_count": len(tag_ids),
        "cluster_count": cluster_count,
        "similarity_count": similarity_rows,
        "cluster_version": version,
        "provider": provider.provider_name,
    }
