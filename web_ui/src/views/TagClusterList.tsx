import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { rebuildTagClusters, listTagClusters } from '@/api/tagClusters'
import type { TagClusterListItem } from '@/types/tagCluster'
import { ArrowRight, Layers3, Loader2, RefreshCw, Search } from 'lucide-react'

const TagClusterList: React.FC = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)
  const [clusters, setClusters] = useState<TagClusterListItem[]>([])
  const [searchText, setSearchText] = useState('')
  const [page, setPage] = useState({ offset: 0, limit: 20, total: 0 })

  const filteredClusters = useMemo(() => {
    if (!searchText.trim()) return clusters
    const keyword = searchText.trim().toLowerCase()
    return clusters.filter((item) =>
      (item.name || '').toLowerCase().includes(keyword) ||
      (item.description || '').toLowerCase().includes(keyword) ||
      (item.centroid_tag_id || '').toLowerCase().includes(keyword)
    )
  }, [clusters, searchText])

  const loadClusters = async () => {
    setLoading(true)
    try {
      const res = await listTagClusters({
        offset: 0,
        limit: 1000,
      }) as unknown as { list?: TagClusterListItem[]; page?: { total?: number } }
      const list = res.list || []
      setClusters(list)
      setPage((prev) => ({
        ...prev,
        total: res.page?.total || list.length,
        offset: 0,
      }))
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: '加载失败',
        description: error?.message || '获取标签聚类失败',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadClusters()
  }, [])

  useEffect(() => {
    setPage((prev) => ({ ...prev, offset: 0 }))
  }, [searchText])

  const rebuild = async () => {
    setRebuilding(true)
    try {
      const res = await rebuildTagClusters() as any
      toast({
        title: '重建完成',
        description: res?.data?.message || '标签聚类已更新',
      })
      await loadClusters()
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: '重建失败',
        description: error?.response?.data?.message || error?.message || '标签聚类重建失败',
      })
    } finally {
      setRebuilding(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(filteredClusters.length / page.limit))
  const currentPage = Math.floor(page.offset / page.limit) + 1
  const paginatedClusters = filteredClusters.slice(page.offset, page.offset + page.limit)

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Layers3 className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold">标签语义聚类</h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            基于标签 profile、文章共现和 embedding 的标签主题簇
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadClusters} disabled={loading || rebuilding}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            刷新
          </Button>
          <Button onClick={rebuild} disabled={loading || rebuilding}>
            {rebuilding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            重建聚类
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>筛选</CardTitle>
          <CardDescription>按名称或描述搜索聚类</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="搜索聚类名称、描述、中心标签..."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>聚类列表</CardTitle>
          <CardDescription>
            共 {page.total} 个聚类，筛选后剩余 {filteredClusters.length} 个，当前页展示 {paginatedClusters.length} 个
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead>中心标签</TableHead>
                  <TableHead>成员数</TableHead>
                  <TableHead>版本</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedClusters.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      {loading ? '加载中...' : '暂无聚类数据'}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedClusters.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="max-w-[360px] truncate text-muted-foreground">
                        {item.description || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{item.centroid_tag_id || '-'}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge>{item.size}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{item.cluster_version}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/tag-clusters/${item.id}`)}>
                          查看
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              第 {currentPage} / {totalPages} 页
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={page.offset <= 0}
                onClick={() => setPage((prev) => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                disabled={page.offset + page.limit >= filteredClusters.length}
                onClick={() => setPage((prev) => ({ ...prev, offset: prev.offset + prev.limit }))}
              >
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default TagClusterList
