from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from core.auth import get_current_user
from core.database import get_db
from core.models.tag_cluster_members import TagClusterMember
from core.models.tag_clusters import TagCluster
from core.models.tag_similarities import TagSimilarity
from core.models.tags import Tags as TagsModel
from core.tag_cluster import rebuild_tag_clusters
from .base import success_response, error_response

router = APIRouter(prefix="/tag-clusters", tags=["标签聚类"])


def _build_merge_suggestions(db: Session, centroid_tag_id: Optional[str]):
    if not centroid_tag_id:
        return []
    centroid_tag = db.query(TagsModel).filter(TagsModel.id == centroid_tag_id).first()
    source_tag_name = centroid_tag.name if centroid_tag and centroid_tag.name else centroid_tag_id
    rows = (
        db.query(TagSimilarity, TagsModel)
        .join(TagsModel, TagsModel.id == TagSimilarity.similar_tag_id)
        .filter(TagSimilarity.tag_id == centroid_tag_id)
        .order_by(TagSimilarity.score.desc())
        .limit(10)
        .all()
    )
    suggestions = []
    for row, tag in rows:
        if row.score < 7500:
            continue
        suggestions.append({
            "source_tag_id": row.tag_id,
            "source_tag_name": source_tag_name,
            "target_tag_id": row.similar_tag_id,
            "target_tag_name": tag.name,
            "score": row.score,
            "reason": "与中心标签语义和共现都高度相近，可考虑合并到中心标签",
        })
    return suggestions


def _get_tag_cluster_payload(db: Session, cluster_id: str):
    cluster = db.query(TagCluster).filter(TagCluster.id == cluster_id).first()
    if not cluster:
        return None

    member_rows = (
        db.query(TagClusterMember, TagsModel)
        .join(TagsModel, TagsModel.id == TagClusterMember.tag_id)
        .filter(TagClusterMember.cluster_id == cluster_id)
        .order_by(TagClusterMember.member_score.desc())
        .all()
    )
    members = [
        {
            "tag_id": member.tag_id,
            "tag_name": tag.name,
            "member_score": member.member_score,
        }
        for member, tag in member_rows
    ]
    merge_suggestions = _build_merge_suggestions(db, cluster.centroid_tag_id)
    return {
        "id": cluster.id,
        "name": cluster.name,
        "description": cluster.description,
        "centroid_tag_id": cluster.centroid_tag_id,
        "size": cluster.size,
        "cluster_version": cluster.cluster_version,
        "members": members,
        "merge_suggestions": merge_suggestions,
        "updated_at": cluster.updated_at.isoformat() if cluster.updated_at else None,
    }


@router.get("")
async def list_tag_clusters(
    offset: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    cur_user: dict = Depends(get_current_user),
):
    total = db.query(TagCluster).count()
    rows = (
        db.query(TagCluster)
        .order_by(TagCluster.size.desc(), TagCluster.updated_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    data = [
        {
            "id": row.id,
            "name": row.name,
            "description": row.description,
            "centroid_tag_id": row.centroid_tag_id,
            "size": row.size,
            "cluster_version": row.cluster_version,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
        for row in rows
    ]
    return success_response(data={
        "list": data,
        "page": {
            "offset": offset,
            "limit": limit,
            "total": total,
        },
    })


@router.get("/similar/{tag_id}")
async def get_similar_tags(
    tag_id: str,
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    cur_user: dict = Depends(get_current_user),
):
    rows = (
        db.query(TagSimilarity, TagsModel)
        .join(TagsModel, TagsModel.id == TagSimilarity.similar_tag_id)
        .filter(TagSimilarity.tag_id == tag_id)
        .order_by(TagSimilarity.score.desc())
        .limit(limit)
        .all()
    )
    data = [
        {
            "tag_id": row.tag_id,
            "similar_tag_id": row.similar_tag_id,
            "similar_tag_name": tag.name,
            "score": row.score,
            "embedding_score": row.embedding_score,
            "cooccurrence_score": row.cooccurrence_score,
            "lexical_score": row.lexical_score,
        }
        for row, tag in rows
    ]
    return success_response(data=data)


@router.get("/{cluster_id}")
async def get_tag_cluster_detail(
    cluster_id: str,
    db: Session = Depends(get_db),
    cur_user: dict = Depends(get_current_user),
):
    payload = _get_tag_cluster_payload(db, cluster_id)
    if not payload:
        return error_response(404, "Tag cluster not found")
    return success_response(data=payload)


@router.get("/{cluster_id}/export")
async def export_tag_cluster(
    cluster_id: str,
    db: Session = Depends(get_db),
    cur_user: dict = Depends(get_current_user),
):
    payload = _get_tag_cluster_payload(db, cluster_id)
    if not payload:
        return error_response(404, "Tag cluster not found")
    return JSONResponse(content={
        "code": 0,
        "message": "success",
        "data": payload,
    })


@router.post("/rebuild")
async def rebuild_clusters(
    db: Session = Depends(get_db),
    cur_user: dict = Depends(get_current_user),
):
    result = rebuild_tag_clusters(db)
    return success_response(data=result, message="标签聚类重建完成")
