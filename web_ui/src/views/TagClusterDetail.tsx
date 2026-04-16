import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { exportTagCluster, getSimilarTags, getTagCluster } from '@/api/tagClusters'
import { getClusterVisualization, getClusterNetwork } from '@/api/visualization'
import { EmbeddingScatterPlot, TagNetworkGraph, VisualizationControls } from '@/components/visualization'
import type {
  SimilarTagItem,
  TagClusterDetail as TagClusterDetailType,
  TagClusterMergeSuggestion,
  VisualizationConfig,
  VisualizationData
} from '@/types/tagCluster'
import type { ReductionMethod } from '@/types/visualization'
import { ArrowLeft, Download, Loader2, Sparkles, Tags, Users, Activity } from 'lucide-react'

const formatScore = (value: number) => (value / 10000).toFixed(2)

const TagClusterDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [cluster, setCluster] = useState<TagClusterDetailType | null>(null)
  const [similarTags, setSimilarTags] = useState<SimilarTagItem[]>([])
  const [similarLoading, setSimilarLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  // 可视化相关状态
  const [vizConfig, setVizConfig] = useState<VisualizationConfig>({
    method: 'pca',
    includeEdges: true,
    minEdgeWeight: 0.5,
    normalize: true
  })
  const [vizData, setVizData] = useState<VisualizationData | null>(null)
  const [vizLoading, setVizLoading] = useState(false)
  const [networkData, setNetworkData] = useState<VisualizationData | null>(null)
  const [networkLoading, setNetworkLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'scatter' | 'network'>('overview')

  const loadCluster = async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await getTagCluster(id) as unknown as TagClusterDetailType
      setCluster(res)
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: '加载失败',
        description: error?.response?.data?.message || error?.message || '获取聚类详情失败',
      })
    } finally {
      setLoading(false)
    }
  }

  const loadVisualization = async () => {
    if (!id) return
    setVizLoading(true)
    try {
      const res = await getClusterVisualization(id, vizConfig) as unknown as VisualizationData
      setVizData(res)
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: '加载可视化失败',
        description: error?.response?.data?.message || error?.message || '获取可视化数据失败',
      })
    } finally {
      setVizLoading(false)
    }
  }

  const loadNetwork = async () => {
    if (!id) return
    setNetworkLoading(true)
    try {
      const res = await getClusterNetwork(id, {
        minSimilarity: vizConfig.minEdgeWeight,
        layoutType: 'force',
        maxNodes: 100
      }) as unknown as VisualizationData
      setNetworkData(res)
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: '加载网络图失败',
        description: error?.response?.data?.message || error?.message || '获取网络图数据失败',
      })
    } finally {
      setNetworkLoading(false)
    }
  }

  const loadSimilarTags = async (tagId?: string | null) => {
    if (!tagId) return
    setSimilarLoading(true)
    try {
      const res = await getSimilarTags(tagId, 10) as unknown as SimilarTagItem[]
      setSimilarTags(res || [])
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: '加载失败',
        description: error?.response?.data?.message || error?.message || '获取相似标签失败',
      })
    } finally {
      setSimilarLoading(false)
    }
  }

  const handleExport = async () => {
    if (!id) return
    setExporting(true)
    try {
      const blob = await exportTagCluster(id) as unknown as Blob
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `tag-cluster-${id}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)
      toast({
        title: '导出完成',
        description: '聚类 JSON 已下载',
      })
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: '导出失败',
        description: error?.response?.data?.message || error?.message || '导出标签聚类失败',
      })
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    loadCluster()
  }, [id])

  useEffect(() => {
    loadSimilarTags(cluster?.centroid_tag_id)
  }, [cluster?.centroid_tag_id])

  useEffect(() => {
    if (cluster && activeTab === 'scatter') {
      loadVisualization()
    }
  }, [cluster, activeTab, vizConfig.method, vizConfig.includeEdges, vizConfig.minEdgeWeight, vizConfig.normalize])

  useEffect(() => {
    if (cluster && activeTab === 'network') {
      loadNetwork()
    }
  }, [cluster, activeTab, vizConfig.minEdgeWeight])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-3">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回
          </Button>
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold">标签聚类详情</h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            查看聚类成员、中心标签、相似标签和可视化分析
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport} disabled={loading || exporting}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            导出 JSON
          </Button>
        </div>
      </div>

      {/* 标签页切换 */}
      <div className="flex gap-2 border-b">
        <Button
          variant={activeTab === 'overview' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('overview')}
          className="rounded-b-none"
        >
          <Users className="mr-2 h-4 w-4" />
          概览
        </Button>
        <Button
          variant={activeTab === 'scatter' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('scatter')}
          className="rounded-b-none"
        >
          <Activity className="mr-2 h-4 w-4" />
          散点图
        </Button>
        <Button
          variant={activeTab === 'network' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('network')}
          className="rounded-b-none"
        >
          <Tags className="mr-2 h-4 w-4" />
          网络图
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>聚类名称</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <div className="text-xl font-semibold">{cluster?.name || '-'}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>成员数量</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-xl font-semibold">
              <Users className="h-5 w-5" />
              {cluster?.size ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>中心标签</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Tags className="h-5 w-5" />
              <Badge variant="secondary">{cluster?.centroid_tag_id || '-'}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>聚类信息</CardTitle>
          <CardDescription>{cluster?.description || '暂无描述'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div>版本：{cluster?.cluster_version || '-'}</div>
          <div>聚类 ID：{cluster?.id || '-'}</div>
          <div>更新时间：{cluster?.updated_at || '-'}</div>
        </CardContent>
      </Card>

      {/* 可视化标签页内容 */}
      {activeTab === 'scatter' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* 控制面板 */}
          <div className="lg:col-span-1">
            <VisualizationControls
              config={vizConfig}
              onConfigChange={setVizConfig}
              methods={['pca', 'tsne', 'umap']}
              disabled={vizLoading}
            />
          </div>

          {/* 散点图 */}
          <div className="lg:col-span-3">
            {vizLoading ? (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </CardContent>
              </Card>
            ) : (
              <EmbeddingScatterPlot
                data={vizData || {nodes: [], edges: [], metadata: {method: vizConfig.method, node_count: 0, edge_count: 0}}}
                height={500}
                interactive={true}
                onNodeClick={(node) => {
                  toast({
                    title: '节点点击',
                    description: `选中标签: ${node.name || node.id}`,
                  })
                }}
              />
            )}
          </div>
        </div>
      )}

      {activeTab === 'network' && (
        <div className="grid grid-cols-1 gap-6">
          {networkLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </CardContent>
            </Card>
          ) : (
            <TagNetworkGraph
              data={networkData || {nodes: [], edges: [], metadata: {layout_type: 'force', node_count: 0, edge_count: 0}}}
              height={600}
              layout="force"
              interactive={true}
              showLabels={true}
              onNodeClick={(node) => {
                toast({
                  title: '节点点击',
                  description: `选中标签: ${node.name || node.id}`,
                })
              }}
            />
          )}
        </div>
      )}

      {/* 概览标签页的原始内容 */}
      {activeTab === 'overview' && (
        <>
      <Card>
        <CardHeader>
          <CardTitle>成员标签</CardTitle>
          <CardDescription>按成员得分排序</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>标签名</TableHead>
                  <TableHead>标签 ID</TableHead>
                  <TableHead>成员得分</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(cluster?.members || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-20 text-center text-muted-foreground">
                      {loading ? '加载中...' : '暂无成员'}
                    </TableCell>
                  </TableRow>
                ) : (
                  cluster!.members.map((member) => (
                    <TableRow key={member.tag_id}>
                      <TableCell className="font-medium">{member.tag_name}</TableCell>
                      <TableCell className="text-muted-foreground">{member.tag_id}</TableCell>
                      <TableCell>
                        <Badge>{formatScore(member.member_score)}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>相似标签</CardTitle>
          <CardDescription>围绕中心标签的 Top 10 相似标签</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>相似标签</TableHead>
                  <TableHead>总分</TableHead>
                  <TableHead>Embedding</TableHead>
                  <TableHead>共现</TableHead>
                  <TableHead>字面</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {similarTags.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                      {similarLoading ? '加载中...' : '暂无相似标签'}
                    </TableCell>
                  </TableRow>
                ) : (
                  similarTags.map((item) => (
                    <TableRow key={item.similar_tag_id}>
                      <TableCell className="font-medium">{item.similar_tag_name}</TableCell>
                      <TableCell><Badge>{formatScore(item.score)}</Badge></TableCell>
                      <TableCell>{formatScore(item.embedding_score)}</TableCell>
                      <TableCell>{formatScore(item.cooccurrence_score)}</TableCell>
                      <TableCell>{formatScore(item.lexical_score)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>合并建议</CardTitle>
          <CardDescription>基于中心标签的高相似候选，供人工审核是否归并</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>来源标签</TableHead>
                  <TableHead>候选目标</TableHead>
                  <TableHead>总分</TableHead>
                  <TableHead>理由</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {((cluster?.merge_suggestions || []) as TagClusterMergeSuggestion[]).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                      暂无合并建议
                    </TableCell>
                  </TableRow>
                ) : (
                  cluster!.merge_suggestions!.map((item) => (
                    <TableRow key={`${item.source_tag_id}-${item.target_tag_id}`}>
                      <TableCell className="font-medium">{item.source_tag_name}</TableCell>
                      <TableCell>{item.target_tag_name}</TableCell>
                      <TableCell><Badge>{formatScore(item.score)}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{item.reason}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
        </>
      )}
    </div>
  )
}

export default TagClusterDetail
