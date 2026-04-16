# Tag Cluster Deployment Checklist

## Before Deploy

- Confirm the backend migration that adds `tag_profiles`, `tag_embeddings`, `tag_similarities`, `tag_clusters`, and `tag_cluster_members` has been applied.
- Confirm `.env` contains at least one embedding provider:
  - `TAG_CLUSTER_EMBEDDING_PROVIDER=bigmodel` with `BIGMODEL_API_KEY`
  - or `TAG_CLUSTER_EMBEDDING_PROVIDER=doubao` with `DOUBAO_API_KEY`
- Confirm the cluster feature is enabled if needed:
  - `TAG_CLUSTER_ENABLED=true`

## Local Verification

- Run Python syntax check:
  - `python3 -m py_compile apis/tag_clusters.py core/tag_cluster.py core/embedding/*.py core/models/tag_*.py scripts/build_tag_clusters.py`
- Run frontend build:
  - `npm run build`
- Run the offline rebuild script:
  - `python3 scripts/build_tag_clusters.py`

## Deploy Verification

- Open `/tag-clusters` in the web UI.
- Confirm cluster list renders.
- Open a cluster detail page.
- Confirm these sections render:
  - cluster summary
  - members
  - similar tags
  - merge suggestions
- Click `导出 JSON` and confirm the downloaded file contains:
  - cluster metadata
  - members
  - merge suggestions

## Operational Notes

- `tag-clusters/rebuild` is an admin-level operation and should only be used when embedding configuration is ready.
- If similarity output looks noisy, check:
  - profile text quality
  - article counts per tag
  - similarity threshold
  - embedding provider configuration
