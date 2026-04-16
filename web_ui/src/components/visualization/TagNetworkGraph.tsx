/**
 * 标签关系网络图组件
 * 展示标签间的语义关系网络
 */

import React, {useEffect, useRef, useState} from 'react'
import {useTheme} from '@/store'
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card'
import {Button} from '@/components/ui/button'
import {Badge} from '@/components/ui/badge'
import {Loader2, Download, RefreshCw, ZoomIn, ZoomOut, Maximize2} from 'lucide-react'
import type {VisualizationData, NetworkGraphProps} from '@/types/visualization'

export const TagNetworkGraph: React.FC<NetworkGraphProps> = ({
  data,
  width = '100%',
  height = 500,
  layout = 'force',
  interactive = true,
  showLabels = true,
  onNodeClick,
  onNodeHover,
  className = ''
}) => {
  const {theme} = useTheme()
  const svgRef = useRef<SVGSVGElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [selectedNode, setSelectedNode] = useState<any>(null)

  // 生成网络图布局
  const generateNetworkLayout = () => {
    if (!data?.nodes || data.nodes.length === 0) {
      return null
    }

    // 基础位置（如果节点没有坐标，使用随机位置）
    const nodes = data.nodes.map(node => ({
      ...node,
      fx: node.x || Math.random() * 800,
      fy: node.y || Math.random() * 600,
      radius: node.size || (node.score ? 5 + node.score * 15 : 8)
    }))

    const edges = data.edges || []

    return {nodes, edges}
  }

  const networkData = generateNetworkLayout()

  // 渲染网络图
  const renderNetwork = () => {
    if (!networkData || !svgRef.current) return

    const svg = svgRef.current
    const {nodes, edges} = networkData

    // 清空现有内容
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild)
    }

    const isDark = theme === 'dark'
    const nodeColor = isDark ? '#60a5fa' : '#3b82f6'
    const edgeColor = isDark ? '#4b5563' : '#d1d5db'
    const textColor = isDark ? '#e5e7eb' : '#374151'

    // 创建缩放组
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.setAttribute('transform', `scale(${zoom})`)
    svg.appendChild(g)

    // 绘制边
    edges.forEach((edge, i) => {
      const sourceNode = nodes.find(n => n.id === edge.source)
      const targetNode = nodes.find(n => n.id === edge.target)

      if (sourceNode && targetNode) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
        line.setAttribute('x1', String(sourceNode.fx))
        line.setAttribute('y1', String(sourceNode.fy))
        line.setAttribute('x2', String(targetNode.fx))
        line.setAttribute('y2', String(targetNode.fy))
        line.setAttribute('stroke', edgeColor)
        line.setAttribute('stroke-width', String(Math.max(1, edge.weight * 3)))
        line.setAttribute('stroke-opacity', String(0.3 + edge.weight * 0.7))
        line.setAttribute('data-edge-index', String(i))
        g.appendChild(line)
      }
    })

    // 绘制节点
    nodes.forEach((node, i) => {
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      group.setAttribute('class', 'node-group')
      group.setAttribute('data-node-id', node.id)
      group.style.cursor = 'pointer'

      // 节点圆圈
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      circle.setAttribute('cx', String(node.fx))
      circle.setAttribute('cy', String(node.fy))
      circle.setAttribute('r', String(node.radius))
      circle.setAttribute('fill', nodeColor)
      circle.setAttribute('fill-opacity', '0.6')
      circle.setAttribute('stroke', nodeColor)
      circle.setAttribute('stroke-width', '2')
      group.appendChild(circle)

      // 节点标签
      if (showLabels) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        text.setAttribute('x', String(node.fx + node.radius + 5))
        text.setAttribute('y', String(node.fy + 4))
        text.setAttribute('fill', textColor)
        text.setAttribute('font-size', '12')
        text.setAttribute('font-family', 'system-ui, sans-serif')
        text.textContent = node.name || node.id
        group.appendChild(text)
      }

      // 事件监听
      group.addEventListener('click', () => {
        setSelectedNode(node)
        if (onNodeClick) {
          onNodeClick(node)
        }
      })

      group.addEventListener('mouseenter', () => {
        circle.setAttribute('fill-opacity', '1')
        circle.setAttribute('stroke-width', '3')
        if (onNodeHover) {
          onNodeHover(node)
        }
      })

      group.addEventListener('mouseleave', () => {
        circle.setAttribute('fill-opacity', '0.6')
        circle.setAttribute('stroke-width', '2')
        if (onNodeHover) {
          onNodeHover(null)
        }
      })

      g.appendChild(group)
    })
  }

  // 当数据或主题变化时重新渲染
  useEffect(() => {
    renderNetwork()
  }, [data, theme, zoom, showLabels])

  // 处理缩放
  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.2, 3))
  }

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.2, 0.2))
  }

  const handleResetZoom = () => {
    setZoom(1)
  }

  // 刷新图表
  const handleRefresh = () => {
    setLoading(true)
    setError(null)
    setTimeout(() => {
      setLoading(false)
      renderNetwork()
    }, 500)
  }

  // 下载图表
  const handleDownload = () => {
    if (svgRef.current) {
      const svgData = new XMLSerializer().serializeToString(svgRef.current)
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new Image()

      img.onload = () => {
        canvas.width = img.width
        canvas.height = img.height
        ctx?.drawImage(img, 0, 0)

        const link = document.createElement('a')
        link.download = `network-graph-${Date.now()}.png`
        link.href = canvas.toDataURL('image/png')
        link.click()
      }

      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
    }
  }

  if (!networkData) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center text-muted-foreground">
            <p>暂无网络图数据</p>
            {data?.metadata?.warning && (
              <p className="text-sm mt-2 text-orange-500">{data.metadata.warning}</p>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>标签关系网络</CardTitle>
            <CardDescription>
              标签间的语义相似度关系 ({data.metadata.layout_type || layout}布局)
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="text-center text-red-500 py-8">
            <p>加载失败: {error}</p>
            <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-4">
              重试
            </Button>
          </div>
        ) : (
          <>
            {/* 缩放控制 */}
            <div className="flex items-center justify-end gap-2 mb-4">
              <Button variant="outline" size="sm" onClick={handleZoomOut} disabled={zoom <= 0.2}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleResetZoom}>
                {Math.round(zoom * 100)}%
              </Button>
              <Button variant="outline" size="sm" onClick={handleZoomIn} disabled={zoom >= 3}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleResetZoom}>
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>

            {/* SVG容器 */}
            <div
              className="border rounded-lg overflow-hidden bg-background"
              style={{width, height: typeof height === 'number' ? `${height}px` : height}}
            >
              <svg
                ref={svgRef}
                width="100%"
                height="100%"
                viewBox="0 0 800 600"
                preserveAspectRatio="xMidYMid meet"
                style={{background: theme === 'dark' ? '#1f2937' : '#ffffff'}}
              />
            </div>

            {/* 统计信息 */}
            <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
              <Badge variant="secondary">{data.metadata.node_count} 个节点</Badge>
              <Badge variant="secondary">{data.metadata.edge_count} 条边</Badge>
              {data.metadata.min_similarity && (
                <Badge variant="secondary">
                  最小相似度: {(data.metadata.min_similarity * 100).toFixed(0)}%
                </Badge>
              )}
              {selectedNode && (
                <div className="ml-auto text-right">
                  <span className="font-medium text-foreground">选中: </span>
                  {selectedNode.name || selectedNode.id}
                </div>
              )}
            </div>

            {/* 说明信息 */}
            {data.metadata.warning && (
              <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-900/20 rounded border border-orange-200 dark:border-orange-800">
                <p className="text-sm text-orange-600 dark:text-orange-400">
                  ⚠️ {data.metadata.warning}
                </p>
              </div>
            )}

            {/* 使用说明 */}
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-600 dark:text-blue-400">
                💡 使用提示：点击节点查看详情，悬停高亮相关节点，使用上方按钮缩放视图
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default TagNetworkGraph