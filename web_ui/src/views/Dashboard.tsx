import React, { useState, useEffect, lazy, Suspense, ErrorInfo, Component } from 'react'
import { getDashboardStats, type DashboardData, type SourceStats, type KeywordStats, type TrendData, type KeywordTrendData } from '@/api/dashboard'
import { getArticles, type Article } from '@/api/article'
import { getSubscriptions, type Subscription } from '@/api/subscription'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Statistic } from '@/components/extensions/statistic'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, Radio } from '@/components/extensions/radio-group'
import { Loader2, FileText, User, Calendar, Flame } from 'lucide-react'
import { useTheme } from '@/store'

// --- 关键修改：动态导入 VChart ---
// 1. 将体积庞大的图表库与主包分离
// 2. 解决模块初始化顺序导致的 ReferenceError: Cannot access 'GE' before initialization
const VChart = lazy(() => 
  import('@visactor/react-vchart').then(module => ({ 
    default: module.VChart 
  })).catch(error => {
    console.error('VChart 加载失败:', error)
    // 返回一个占位组件
    return {
      default: ({ style }: any) => (
        <div style={style} className="flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <div className="mb-2">图表加载失败</div>
            <div className="text-sm">请刷新页面重试</div>
          </div>
        </div>
      )
    } as any
  })
)

// 错误边界组件
class ChartErrorBoundary extends Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('图表渲染错误:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex items-center justify-center h-[400px] text-muted-foreground">
          <div className="text-center">
            <div className="mb-2">图表渲染失败</div>
            <div className="text-sm">请刷新页面重试</div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

const Dashboard: React.FC = () => {
  const { theme } = useTheme()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  
  // 视图控制状态
  const [keywordViewMode, setKeywordViewMode] = useState<'tags' | 'chart'>('tags')
  const [keywordChartType, setKeywordChartType] = useState<'stack' | 'line'>('stack')

  // 检测当前实际主题
  const isDarkMode = () => {
    if (theme === 'dark') return true
    if (theme === 'light') return false
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ||
             document.documentElement.classList.contains('dark') ||
             document.documentElement.hasAttribute('data-theme')
    }
    return false
  }

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      setError('')
      
      try {
        const res = await getDashboardStats()
        if (res && (res as any).data) {
          const responseData = (res as any).data
          if (responseData.code === 0 || responseData.code === 200) {
            setDashboardData(responseData.data)
            return
          } else {
            const errorMsg = responseData.message || responseData.msg || '未知错误'
            console.error('Dashboard API 返回错误:', responseData.code, errorMsg)
            // 降级处理
            await calculateStatsFromAPIs()
            return
          }
        }
      } catch (apiError: any) {
        console.warn('Dashboard API 调用失败，使用回退计算:', apiError)
        await calculateStatsFromAPIs()
        return
      }
      
      await calculateStatsFromAPIs()
    } catch (err: any) {
      console.error('获取统计数据失败:', err)
      setError(`获取统计数据失败: ${err?.message || '未知错误'}`)
    } finally {
      setLoading(false)
    }
  }

  // --- 回退计算逻辑 (保持原有逻辑不变) ---
  const calculateStatsFromAPIs = async () => {
    try {
      const articlesRes = await getArticles({ page: 0, pageSize: 100 })
      const articles: Article[] = (articlesRes as any)?.list || (articlesRes as any)?.data?.list || []
      const totalArticles = (articlesRes as any)?.total || (articlesRes as any)?.data?.total || articles.length

      const subscriptionsRes = await getSubscriptions({ page: 0, pageSize: 100 })
      const subscriptions: Subscription[] = (subscriptionsRes as any)?.list || (subscriptionsRes as any)?.data?.list || []
      const totalSources = (subscriptionsRes as any)?.total || (subscriptionsRes as any)?.data?.total || subscriptions.length

      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      
      const todayArticles = articles.filter(article => new Date(article.created_at) >= todayStart).length
      const weekArticles = articles.filter(article => new Date(article.created_at) >= weekStart).length

      // 来源统计
      const sourceMap = new Map<string, { mp_id: string; mp_name: string; count: number }>()
      articles.forEach(article => {
        const key = article.mp_name || '未知来源'
        const existing = sourceMap.get(key) || { mp_id: article.mp_name || '', mp_name: key, count: 0 }
        existing.count++
        sourceMap.set(key, existing)
      })
      
      const sourceStats: SourceStats[] = Array.from(sourceMap.values())
        .map(item => ({
          mp_id: item.mp_id,
          mp_name: item.mp_name,
          article_count: item.count,
          percentage: totalArticles > 0 ? (item.count / totalArticles) * 100 : 0
        }))
        .sort((a, b) => b.article_count - a.article_count)
        .slice(0, 10)

      // 关键词统计
      const keywordMap = new Map<string, number>()
      const keywordTrendMap = new Map<string, Map<string, number>>()
      const keywordTrendThirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const invalidKeywordPattern = /^[a-z]{1,2}$|^[0-9]+$|^[^\u4e00-\u9fa5a-zA-Z0-9]+$|^\.+$/
      
      articles.forEach((article: any) => {
        let articleDate: Date
        let dateKey: string
        
        if (article.publish_time) {
          const publishTimestamp = typeof article.publish_time === 'number' ? article.publish_time : parseInt(article.publish_time)
          const timestampMs = publishTimestamp < 10000000000 ? publishTimestamp * 1000 : publishTimestamp
          articleDate = new Date(timestampMs)
        } else {
          articleDate = new Date(article.created_at)
        }
        dateKey = articleDate.toISOString().split('T')[0]
        
        const tags = article.tags || article.tag_names || []
        const keywords: string[] = []
        
        if (Array.isArray(tags)) {
          tags.forEach((tag: any) => {
            const keyword = typeof tag === 'string' ? tag : (tag?.name || tag?.tag_name || '')
            if (keyword && keyword.trim()) {
              const trimmedKeyword = keyword.trim()
              if (trimmedKeyword.length >= 2 && !invalidKeywordPattern.test(trimmedKeyword) && trimmedKeyword.length <= 20) {
                keywords.push(trimmedKeyword)
              }
            }
          })
        }
        
        keywords.forEach(keyword => {
          if (articleDate >= keywordTrendThirtyDaysAgo) {
            keywordMap.set(keyword, (keywordMap.get(keyword) || 0) + 1)
            if (!keywordTrendMap.has(dateKey)) {
              keywordTrendMap.set(dateKey, new Map())
            }
            keywordTrendMap.get(dateKey)!.set(keyword, (keywordTrendMap.get(dateKey)!.get(keyword) || 0) + 1)
          }
        })
      })

      const keywordStats: KeywordStats[] = Array.from(keywordMap.entries())
        .map(([keyword, count]) => ({ keyword, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20)
      
      const topKeywords = keywordStats.slice(0, 10).map(k => k.keyword)
      
      const dateRange: string[] = []
      for (let i = 29; i >= 0; i--) {
        dateRange.push(new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      }
      
      const keywordTrendData: KeywordTrendData[] = dateRange.map(date => {
        const dayKeywords = keywordTrendMap.get(date) || new Map()
        const keywords: { [key: string]: number } = {}
        topKeywords.forEach(keyword => {
          keywords[keyword] = dayKeywords.get(keyword) || 0
        })
        return { date, keywords }
      })
      
      // 调试信息：检查数据是否正确生成
      if (keywordTrendData.length > 0 && topKeywords.length > 0) {
        console.log('关键词趋势数据已生成:', {
          dateRange: dateRange.length,
          topKeywords: topKeywords.length,
          keywordTrendDataLength: keywordTrendData.length,
          sampleData: keywordTrendData[0]
        })
      }

      // 趋势统计
      const trendMap = new Map<string, Map<string, number>>()
      const thirtyDaysAgoTimestamp = Math.floor(keywordTrendThirtyDaysAgo.getTime() / 1000)
      const trendDateRange: string[] = []
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        trendDateRange.push(d)
        trendMap.set(d, new Map())
      }
      
      const allMpNames = new Set<string>()
      articles.forEach((article: any) => {
        const publishTime = article.publish_time
        if (publishTime && typeof publishTime === 'number' && publishTime >= thirtyDaysAgoTimestamp) {
          const timestamp = publishTime.toString().length <= 10 ? publishTime * 1000 : publishTime
          const publishDate = new Date(timestamp)
          if (!isNaN(publishDate.getTime())) {
            const dateKey = publishDate.toISOString().split('T')[0]
            const mpName = article.mp_name || '未知来源'
            allMpNames.add(mpName)
            const dayMap = trendMap.get(dateKey) || new Map()
            dayMap.set(mpName, (dayMap.get(mpName) || 0) + 1)
            trendMap.set(dateKey, dayMap)
          }
        }
      })

      const trendData: TrendData[] = trendDateRange.map(date => {
        const dayMap = trendMap.get(date) || new Map()
        const sources: { [mp_name: string]: number } = {}
        allMpNames.forEach(mpName => {
          sources[mpName] = dayMap.get(mpName) || 0
        })
        return { date, sources }
      })

      setDashboardData({
        stats: { totalArticles, totalSources, todayArticles, weekArticles },
        sourceStats,
        keywordStats,
        trendData,
        keywordTrendData
      })
    } catch (err) {
      console.error('计算统计数据失败:', err)
      throw err
    }
  }

  // --- 图表配置生成函数 ---

  const getColorPalette = (count: number): string[] => {
    const dark = isDarkMode()
    const colors = dark ? [
      'hsl(262.1, 83.3%, 70%)', 'hsl(221.2, 83.2%, 68%)', 'hsl(199.1, 89.1%, 65%)',
      'hsl(142.1, 76.2%, 55%)', 'hsl(38.7, 92%, 65%)', 'hsl(0, 84.2%, 70%)',
      'hsl(280, 70%, 65%)', 'hsl(240, 70%, 65%)', 'hsl(200, 80%, 65%)',
      'hsl(160, 60%, 60%)', 'hsl(330, 70%, 70%)', 'hsl(15, 90%, 70%)'
    ] : [
      'hsl(262.1, 83.3%, 57.8%)', 'hsl(221.2, 83.2%, 53.3%)', 'hsl(199.1, 89.1%, 48.2%)',
      'hsl(142.1, 76.2%, 36.3%)', 'hsl(38.7, 92%, 50%)', 'hsl(0, 84.2%, 60.2%)',
      'hsl(280, 70%, 50%)', 'hsl(240, 70%, 50%)', 'hsl(200, 80%, 50%)',
      'hsl(160, 60%, 45%)', 'hsl(330, 70%, 55%)', 'hsl(15, 90%, 55%)'
    ]
    const result: string[] = []
    for (let i = 0; i < count; i++) {
      result.push(colors[i % colors.length])
    }
    return result
  }

  const getSourceChartSpec = (sourceStats: SourceStats[]) => {
    const dark = isDarkMode()
    return {
      type: 'pie',
      background: 'transparent',
      data: {
        values: sourceStats.map(item => ({
          name: item.mp_name || item.mp_id,
          value: item.article_count
        }))
      },
      categoryField: 'name',
      valueField: 'value',
      outerRadius: 0.8,
      label: { visible: true, style: { fontSize: 12, fill: dark ? '#E5E7EB' : '#374151' } },
      tooltip: { mark: { content: [{ key: (d: any) => d.name, value: (d: any) => `${d.value} 篇` }] } },
      color: getColorPalette(sourceStats.length)
    }
  }

  const getTrendChartSpec = (trendData: TrendData[]): any => {
    const dark = isDarkMode()
    const textColor = dark ? '#E5E7EB' : '#374151'
    const gridColor = dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
    
    const allMpNames = new Set<string>()
    trendData.forEach(item => Object.keys(item.sources).forEach(n => { if (item.sources[n] > 0) allMpNames.add(n) }))
    const mpNamesArray = Array.from(allMpNames)
    
    const chartData: any[] = []
    trendData.forEach(item => {
      mpNamesArray.forEach(mpName => {
        const count = item.sources[mpName] || 0
        if (count > 0) chartData.push({ date: item.date, mp_name: mpName, count })
      })
    })
    
    const maxCount = Math.max(...chartData.map(item => item.count), 1)

    return {
      type: 'scatter',
      background: 'transparent',
      data: { values: chartData },
      xField: 'date',
      yField: 'count',
      seriesField: 'mp_name',
      sizeField: 'count',
      size: { type: 'linear', range: [10, 40], domain: [0, maxCount] },
      point: { visible: true, style: { fillOpacity: 0.7, strokeWidth: 1.5 } },
      color: getColorPalette(mpNamesArray.length),
      axes: [
        {
          orient: 'bottom' as const, type: 'band' as const,
          domainLine: { visible: true, style: { stroke: gridColor } },
          grid: { visible: true, style: { stroke: gridColor } },
          tick: { visible: true, style: { stroke: gridColor } },
          label: { visible: true, style: { fill: textColor, fontSize: 11 }, formatMethod: (v: string, i: number) => i % 5 === 0 ? v : '' }
        },
        {
          orient: 'left' as const, type: 'linear' as const, zero: true,
          domainLine: { visible: true, style: { stroke: gridColor } },
          grid: { visible: true, style: { stroke: gridColor } },
          tick: { visible: true, style: { stroke: gridColor } },
          label: { visible: true, style: { fill: textColor, fontSize: 12 } }
        }
      ],
      legends: { visible: true, orient: 'top' as const, position: 'start' as const, item: { label: { style: { fill: textColor, fontSize: 11 } } } },
      tooltip: {
        mark: {
          content: [
            { key: () => '日期', value: (d: any) => d.date },
            { key: () => '公众号', value: (d: any) => d.mp_name },
            { key: () => '文章数', value: (d: any) => `${d.count} 篇` }
          ]
        }
      }
    }
  }

  const getKeywordStackChartSpec = (keywordTrendData: KeywordTrendData[], topKeywords: string[]) => {
    const dark = isDarkMode()
    const textColor = dark ? '#E5E7EB' : '#374151'
    const gridColor = dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
    
    const chartData = keywordTrendData.flatMap(item => topKeywords.map(keyword => ({
      date: item.date, keyword, count: item.keywords[keyword] || 0
    })))

    // 确保有数据才渲染图表
    if (chartData.length === 0) {
      console.warn('关键词图表数据为空')
      return null
    }

    return {
      type: 'bar',
      background: 'transparent',
      data: { values: chartData },
      xField: 'date', 
      yField: 'count', 
      seriesField: 'keyword', 
      stack: true,
      bar: { style: { cornerRadius: 4 } },
      color: getColorPalette(topKeywords.length),
      tooltip: {
        mark: {
          content: [
            { key: () => '日期', value: (d: any) => d.date },
            { key: () => '关键词', value: (d: any) => d.keyword },
            { key: () => '出现次数', value: (d: any) => `${d.count} 次` }
          ]
        }
      },
      axes: [
        {
          orient: 'bottom' as const, 
          type: 'band' as const,
          domainLine: { visible: true, style: { stroke: gridColor } },
          grid: { visible: true, style: { stroke: gridColor } },
          tick: { visible: false },
          label: { 
            visible: true, 
            style: { fontSize: 10, angle: -45, fill: textColor },
            formatMethod: (v: string, i: number) => i % 5 === 0 ? v : ''
          }
        },
        {
          orient: 'left' as const, 
          type: 'linear' as const,
          domainLine: { visible: true, style: { stroke: gridColor } },
          grid: { visible: true, style: { stroke: gridColor } },
          tick: { visible: true, style: { stroke: gridColor } },
          label: { visible: true, style: { fill: textColor, fontSize: 12 } }
        }
      ],
      legends: { 
        visible: true, 
        orient: 'top' as const, 
        position: 'start' as const, 
        item: { label: { style: { fill: textColor, fontSize: 12 } } } 
      }
    }
  }

  const getKeywordLineChartSpec = (keywordTrendData: KeywordTrendData[], topKeywords: string[]) => {
    const dark = isDarkMode()
    const textColor = dark ? '#E5E7EB' : '#374151'
    const gridColor = dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
    
    const chartData = keywordTrendData.flatMap(item => topKeywords.map(keyword => ({
      date: item.date, keyword, count: item.keywords[keyword] || 0
    })))

    // 确保有数据才渲染图表
    if (chartData.length === 0) {
      console.warn('关键词折线图数据为空')
      return null
    }

    return {
      type: 'line',
      background: 'transparent',
      data: { values: chartData },
      xField: 'date', 
      yField: 'count', 
      seriesField: 'keyword',
      point: { visible: true, style: { size: 3 } },
      line: { style: { lineWidth: 2 } },
      color: getColorPalette(topKeywords.length),
      tooltip: {
        mark: {
          content: [
            { key: () => '日期', value: (d: any) => d.date },
            { key: () => '关键词', value: (d: any) => d.keyword },
            { key: () => '出现次数', value: (d: any) => `${d.count} 次` }
          ]
        }
      },
      axes: [
        {
          orient: 'bottom' as const, 
          type: 'band' as const,
          domainLine: { visible: true, style: { stroke: gridColor } },
          grid: { visible: true, style: { stroke: gridColor } },
          tick: { visible: false },
          label: { 
            visible: true, 
            style: { fontSize: 10, angle: -45, fill: textColor },
            formatMethod: (v: string, i: number) => i % 5 === 0 ? v : ''
          }
        },
        {
          orient: 'left' as const, 
          type: 'linear' as const,
          domainLine: { visible: true, style: { stroke: gridColor } },
          grid: { visible: true, style: { stroke: gridColor } },
          tick: { visible: true, style: { stroke: gridColor } },
          label: { visible: true, style: { fill: textColor, fontSize: 12 } }
        }
      ],
      legends: { 
        visible: true, 
        orient: 'top' as const, 
        position: 'start' as const, 
        item: { label: { style: { fill: textColor, fontSize: 12 } } } 
      }
    }
  }

  // --- 渲染层 ---

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive" className="m-5">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  const { stats, sourceStats, keywordStats, trendData, keywordTrendData = [] } = dashboardData || {
    stats: { totalArticles: 0, totalSources: 0, todayArticles: 0, weekArticles: 0 },
    sourceStats: [], keywordStats: [], trendData: [], keywordTrendData: []
  }

  const topKeywords = keywordStats.slice(0, 10).map(k => k.keyword)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-foreground">数据概览</h1>
        <p className="text-muted-foreground text-sm">查看您的订阅数据和统计信息</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-6">
            <Statistic title="总文章数" value={stats.totalArticles} prefix={<FileText className="h-5 w-5 text-primary" />} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <Statistic title="来源数量" value={stats.totalSources} prefix={<User className="h-5 w-5 text-primary" />} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <Statistic title="今日新增" value={stats.todayArticles} prefix={<Calendar className="h-5 w-5 text-primary" />} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <Statistic title="本周新增" value={stats.weekArticles} prefix={<Flame className="h-5 w-5 text-primary" />} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card className="h-[400px]">
          <CardHeader>
            <CardTitle className="text-base font-semibold">来源分布</CardTitle>
          </CardHeader>
          <CardContent>
            {sourceStats.length > 0 ? (
              <Suspense fallback={<div className="flex justify-center items-center h-[320px]"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
                <VChart spec={getSourceChartSpec(sourceStats)} style={{ height: '320px' }} />
              </Suspense>
            ) : (
              <div className="flex justify-center items-center h-[320px] text-muted-foreground">暂无数据</div>
            )}
          </CardContent>
        </Card>

        <Card className="h-[400px]">
          <CardHeader>
            <CardTitle className="text-base font-semibold">抓取趋势</CardTitle>
          </CardHeader>
          <CardContent>
            {trendData.length > 0 && trendData.some(item => Object.values(item.sources).some(c => c > 0)) ? (
              <Suspense fallback={<div className="flex justify-center items-center h-[320px]"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
                <VChart spec={getTrendChartSpec(trendData)} style={{ height: '320px' }} />
              </Suspense>
            ) : (
              <div className="flex justify-center items-center h-[320px] text-muted-foreground">暂无数据</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mb-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center w-full">
              <CardTitle className="text-base font-semibold">热门关键词</CardTitle>
              <div className="flex gap-2">
                <RadioGroup value={keywordViewMode} onValueChange={(v: string) => setKeywordViewMode(v as any)} type="button" size="small">
                  <Radio value="tags" button size="small">标签视图</Radio>
                  <Radio value="chart" button size="small">趋势图表</Radio>
                </RadioGroup>
                {keywordViewMode === 'chart' && keywordTrendData.length > 0 && (
                  <RadioGroup value={keywordChartType} onValueChange={(v: string) => setKeywordChartType(v as any)} type="button" size="small">
                    <Radio value="stack" button size="small">堆叠柱状图</Radio>
                    <Radio value="line" button size="small">折线图</Radio>
                  </RadioGroup>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {keywordStats.length > 0 ? (
              <>
                {/* 视图模式 1: 标签云 */}
                {keywordViewMode === 'tags' && (
                  <div className="mb-5 flex flex-wrap gap-3 animate-in fade-in zoom-in duration-300">
                    {keywordStats.slice(0, 20).map((item, index) => (
                      <Badge key={index} variant={index < 3 ? "default" : "secondary"} className="text-sm px-4 py-2 font-normal">
                        {item.keyword} ({item.count})
                      </Badge>
                    ))}
                  </div>
                )}

                {/* 视图模式 2: 趋势图 */}
                {keywordViewMode === 'chart' && (
                  <>
                    {keywordTrendData && keywordTrendData.length > 0 && topKeywords && topKeywords.length > 0 ? (() => {
                      const chartSpec = keywordChartType === 'stack' 
                        ? getKeywordStackChartSpec(keywordTrendData, topKeywords) 
                        : getKeywordLineChartSpec(keywordTrendData, topKeywords)
                      
                      if (!chartSpec) {
                        return (
                          <div className="text-center text-muted-foreground py-10">
                            <div>图表配置生成失败，请检查数据</div>
                          </div>
                        )
                      }
                      
                      return (
                        <div className="mt-6 h-[400px] animate-in fade-in slide-in-from-bottom-2 duration-300">
                          <ChartErrorBoundary>
                            <Suspense fallback={<div className="flex justify-center items-center h-[400px]"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
                              <VChart 
                                spec={chartSpec} 
                                style={{ height: '400px', width: '100%' }} 
                              />
                            </Suspense>
                          </ChartErrorBoundary>
                        </div>
                      )
                    })() : (
                      <div className="text-center text-muted-foreground py-10">
                        {!topKeywords || topKeywords.length === 0 ? (
                          <div>暂无热门关键词数据，无法显示趋势图表</div>
                        ) : (
                          <div>暂无趋势数据，请等待数据采集完成后查看</div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="text-center text-muted-foreground py-10">暂无数据</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default Dashboard