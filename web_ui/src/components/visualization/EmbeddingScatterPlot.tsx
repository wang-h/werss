/**
 * Embedding散点图组件
 * 使用VChart展示标签在2D空间中的分布
 */

import React, {Suspense, useEffect, useRef, useState} from 'react'
import {useTheme} from 'next-themes'
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card'
import {Button} from '@/components/ui/button'
import {Badge} from '@/components/ui/badge'
import {Loader2, Download, Maximize2, RefreshCw} from 'lucide-react'
import type {VisualizationData, ScatterPlotProps} from '@/types/visualization'

// 懒加载VChart组件
const VChart = React.lazy(() =>
  import('@visactor/react-vchart').then(module => ({default: module.VChart}))
)

export const EmbeddingScatterPlot: React.FC<ScatterPlotProps> = ({
  data,
  width = '100%',
  height = 400,
  interactive = true,
  showTooltip = true,
  onNodeClick,
  onNodeHover,
  className = ''
}) => {
  const {theme} = useTheme()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [hoveredNode, setHoveredNode] = useState<any>(null)
  const chartRef = useRef<any>(null)

  // 生成VChart配置
  const generateSpec = () => {
    if (!data?.nodes || data.nodes.length === 0) {
      return null
    }

    const isDark = theme === 'dark'
    const primaryColor = isDark ? '#60a5fa' : '#3b82f6'
    const hoverColor = isDark ? '#f472b6' : '#ec4899'
    const textColor = isDark ? '#e5e7eb' : '#374151'
    const gridColor = isDark ? '#374151' : '#e5e7eb'

    // 准备数据
    const plotData = data.nodes.map(node => ({
      ...node,
      _x: node.x,
      _y: node.y,
      _size: node.size || (node.score ? 5 + node.score * 15 : 8),
      _cluster: node.cluster
    }))

    return {
      type: 'chart',
      data: plotData,
      // 主题配置
      theme: {
        color: isDark ? 'dark' : 'light'
      },
      // 标题配置
      title: {
        visible: false
      },
      // 图例配置
      legend: {
        visible: false
      },
      // X轴配置
      xAxis: {
        visible: true,
        title: {
          visible: false
        },
        label: {
          visible: false
        },
        grid: {
          visible: false
        },
        line: {
          visible: false
        }
      },
      // Y轴配置
      yAxis: {
        visible: true,
        title: {
          visible: false
        },
        label: {
          visible: false
        },
        grid: {
          visible: false
        },
        line: {
          visible: false
        }
      },
      // 散点图系列
      series: [
        {
          type: 'scatter',
          xField: '_x',
          yField: '_y',
          sizeField: '_size',
          colorField: '_cluster',
          size: [8, 20],
          color: [primaryColor],
          shape: 'circle',
          // 点的样式
          point: {
            style: {
              fill: primaryColor,
              fillOpacity: 0.6,
              stroke: primaryColor,
              strokeWidth: 1
            },
            state: {
              hover: {
                fill: hoverColor,
                fillOpacity: 0.8,
                stroke: hoverColor,
                strokeWidth: 2,
                larger: true
              },
              selected: {
                fill: hoverColor,
                fillOpacity: 1,
                stroke: hoverColor,
                strokeWidth: 2,
                larger: true
              }
            }
          },
          // 交互配置
          interactive: true,
          // 标签配置
          label: {
            visible: false,
            field: 'name',
            style: {
              fill: textColor,
              fontSize: 11
            }
          }
        }
      ],
      // 交互配置
      interactions: interactive ? [
        {
          type: 'tooltip',
          enable: showTooltip
        },
        {
          type: 'hover-highlight'
        },
        {
          type: 'select',
          enable: true
        }
      ] : [],
      // Tooltip配置
      tooltip: {
        show: showTooltip,
        trigger: 'hover',
        showContent: true,
        renderMode: 'html',
        domStyles: {
          'plot-tooltip': {
            'background-color': isDark ? '#1f2937' : '#ffffff',
            'color': textColor,
            'border-color': gridColor,
            'border-width': '1px',
            'border-radius': '4px',
            'padding': '8px',
            'box-shadow': '0 2px 8px rgba(0,0,0,0.1)'
          }
        },
        customContent: (datum: any) => {
          return `
            <div style="padding: 8px; min-width: 150px;">
              <div style="font-weight: bold; margin-bottom: 4px; color: ${hoverColor};">
                ${datum.name || datum.id}
              </div>
              <div style="font-size: 12px; color: ${textColor};">
                <div>ID: ${datum.id}</div>
                ${datum.score ? `<div>得分: ${(datum.score * 100).toFixed(1)}%</div>` : ''}
                <div>位置: (${datum._x.toFixed(2)}, ${datum._y.toFixed(2)})</div>
              </div>
            </div>
          `
        }
      },
      // 动画配置
      animation: true,
      animationAppear: {
        duration: 1000
      }
    }
  }

  const spec = generateSpec()

  // 处理图表点击事件
  const handleChartClick = (datum: any) => {
    if (datum && datum.datum && onNodeClick) {
      const nodeData = datum.datum
      setSelectedNode(nodeData)
      onNodeClick(nodeData)
    }
  }

  // 处理图表悬停事件
  const handleChartHover = (datum: any) => {
    if (datum && datum.datum) {
      setHoveredNode(datum.datum)
      if (onNodeHover) {
        onNodeHover(datum.datum)
      }
    } else {
      setHoveredNode(null)
      if (onNodeHover) {
        onNodeHover(null)
      }
    }
  }

  // 刷新图表
  const handleRefresh = () => {
    setLoading(true)
    setError(null)
    // 模拟刷新延迟
    setTimeout(() => {
      setLoading(false)
    }, 500)
  }

  // 下载图表
  const handleDownload = () => {
    if (chartRef.current) {
      // 这里可以实现图表下载功能
      const link = document.createElement('a')
      link.download = `scatter-plot-${Date.now()}.png`
      link.href = '' // 需要实际的图表截图实现
      link.click()
    }
  }

  if (!spec) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center text-muted-foreground">
            <p>暂无可视化数据</p>
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
            <CardTitle>聚类可视化</CardTitle>
            <CardDescription>
              标签在向量空间中的分布 ({data.metadata.method?.toUpperCase()}降维)
              {data.metadata.dimensions && ` - ${data.metadata.dimensions}维→2维`}
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
          <Suspense fallback={<div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>}>
            <div style={{width, height}} className="mx-auto">
              <VChart
                ref={chartRef}
                spec={spec}
                onClick={handleChartClick}
                onHover={handleChartHover}
                style={{width: '100%', height: '100%'}}
              />
            </div>
          </Suspense>
        )}

        {/* 统计信息 */}
        <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
          <Badge variant="secondary">{data.metadata.node_count} 个节点</Badge>
          {data.metadata.edge_count > 0 && (
            <Badge variant="secondary">{data.metadata.edge_count} 条边</Badge>
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
      </CardContent>
    </Card>
  )
}

export default EmbeddingScatterPlot