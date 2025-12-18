import React, { useState, useEffect } from 'react'
import { VChart } from '@visactor/react-vchart'
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

const Dashboard: React.FC = () => {
  const { theme } = useTheme()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [keywordViewMode, setKeywordViewMode] = useState<'tags' | 'chart'>('tags')
  const [keywordChartType, setKeywordChartType] = useState<'stack' | 'line'>('stack')

  // 检测当前实际主题（处理 system 情况）
  const isDarkMode = () => {
    if (theme === 'dark') return true
    if (theme === 'light') return false
    // system 模式，检查实际系统主题
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
      
      // 从专用接口获取数据（使用 article_tags 表的 article_publish_date）
      // 后端 API 从 article_tags 表读取数据，使用 article_publish_date 来统计趋势
      try {
        const res = await getDashboardStats()
        if (res && (res as any).data) {
          const responseData = (res as any).data
          // 检查响应格式
          if (responseData.code === 0 || responseData.code === 200) {
            setDashboardData(responseData.data)
            return
          } else {
            // API 返回了错误码
            const errorMsg = responseData.message || responseData.msg || '未知错误'
            console.error('Dashboard API 返回错误:', responseData.code, errorMsg)
            setError(`获取统计数据失败: ${errorMsg}`)
            // 尝试回退
            await calculateStatsFromAPIs()
            return
          }
        }
      } catch (apiError: any) {
        // API 调用失败（网络错误、500错误等）
        console.error('Dashboard API 调用失败:', apiError)
        const errorMsg = apiError?.response?.data?.message || apiError?.message || 'API 调用失败'
        console.warn('Dashboard API 调用失败，使用回退计算（基于文章 publish_time）:', errorMsg)
        // 尝试回退
        await calculateStatsFromAPIs()
        return
      }
      
      // 如果接口返回格式不正确，尝试回退（使用文章的 publish_time 而不是 created_at）
      if (import.meta.env.DEV) {
        console.warn('Dashboard API 返回格式异常，使用回退计算（基于文章 publish_time）')
      }
      await calculateStatsFromAPIs()
    } catch (err: any) {
      console.error('获取统计数据失败:', err)
      const errorMsg = err?.message || '未知错误'
      setError(`获取统计数据失败: ${errorMsg}`)
    } finally {
      setLoading(false)
    }
  }

  // 从现有 API 计算统计数据
  const calculateStatsFromAPIs = async () => {
    try {
      // 获取所有文章（API限制limit最大为100，所以分批获取或只获取前100条用于统计）
      const articlesRes = await getArticles({ page: 0, pageSize: 100 })
      const articles: Article[] = (articlesRes as any)?.list || (articlesRes as any)?.data?.list || []
      const totalArticles = (articlesRes as any)?.total || (articlesRes as any)?.data?.total || articles.length

      // 获取所有订阅源（API限制limit最大为100）
      const subscriptionsRes = await getSubscriptions({ page: 0, pageSize: 100 })
      const subscriptions: Subscription[] = (subscriptionsRes as any)?.list || (subscriptionsRes as any)?.data?.list || []
      const totalSources = (subscriptionsRes as any)?.total || (subscriptionsRes as any)?.data?.total || subscriptions.length

      // 计算今日和本周新增
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      
      const todayArticles = articles.filter(article => {
        const created = new Date(article.created_at)
        return created >= todayStart
      }).length

      const weekArticles = articles.filter(article => {
        const created = new Date(article.created_at)
        return created >= weekStart
      }).length

      // 计算来源统计
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

      // 计算热词（从文章的 tags 中获取关键词，而不是从标题拆分）
      const keywordMap = new Map<string, number>()
      const keywordTrendMap = new Map<string, Map<string, number>>() // date -> keyword -> count
      const keywordTrendThirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      
      // 过滤无效关键词的正则表达式
      const invalidKeywordPattern = /^[a-z]{1,2}$|^[0-9]+$|^[^\u4e00-\u9fa5a-zA-Z0-9]+$|^\.+$/
      
      articles.forEach((article: any) => {
        // 使用文章的 publish_time（发布时间）而不是 created_at（抓取时间）
        // 注意：这是回退逻辑，理想情况下应该使用后端 API 返回的数据（基于 article_tags.article_publish_date）
        let articleDate: Date
        let dateKey: string
        
        if (article.publish_time) {
          // publish_time 是时间戳（秒级或毫秒级）
          const publishTimestamp = typeof article.publish_time === 'number' 
            ? article.publish_time 
            : parseInt(article.publish_time)
          // 如果是秒级时间戳（小于 10000000000），转换为毫秒级
          const timestampMs = publishTimestamp < 10000000000 ? publishTimestamp * 1000 : publishTimestamp
          articleDate = new Date(timestampMs)
        } else {
          // 如果没有 publish_time，使用 created_at 作为回退
          articleDate = new Date(article.created_at)
        }
        dateKey = articleDate.toISOString().split('T')[0]
        
        // 从文章的 tags 中获取关键词（支持多种格式）
        const tags = article.tags || article.tag_names || []
        const keywords: string[] = []
        
        if (Array.isArray(tags) && tags.length > 0) {
          tags.forEach((tag: any) => {
            // 支持多种 tag 格式：{ name: "xxx" } 或直接是字符串
            const keyword = typeof tag === 'string' ? tag : (tag?.name || tag?.tag_name || '')
            if (keyword && keyword.trim()) {
              const trimmedKeyword = keyword.trim()
              // 过滤无效关键词：
              // 1. 长度至少2个字符
              // 2. 不是单个或两个小写字母（如 "pe", "en"）
              // 3. 不是纯数字
              // 4. 不是纯标点符号
              // 5. 不是只有点号
              if (
                trimmedKeyword.length >= 2 &&
                !invalidKeywordPattern.test(trimmedKeyword) &&
                trimmedKeyword.length <= 20 // 限制最大长度
              ) {
                keywords.push(trimmedKeyword)
              }
            }
          })
        }
        
        keywords.forEach(keyword => {
          // 统计总数（只统计最近30天）
          if (articleDate >= keywordTrendThirtyDaysAgo) {
            keywordMap.set(keyword, (keywordMap.get(keyword) || 0) + 1)
          }
          
          // 统计趋势（只统计最近30天，使用文章的发布时间）
          if (articleDate >= keywordTrendThirtyDaysAgo) {
            if (!keywordTrendMap.has(dateKey)) {
              keywordTrendMap.set(dateKey, new Map())
            }
            const dayKeywords = keywordTrendMap.get(dateKey)!
            dayKeywords.set(keyword, (dayKeywords.get(keyword) || 0) + 1)
          }
        })
      })

      const keywordStats: KeywordStats[] = Array.from(keywordMap.entries())
        .map(([keyword, count]) => ({ keyword, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20)
      
      // 计算关键词趋势数据（取前10个热门关键词）
      const topKeywords = keywordStats.slice(0, 10).map(k => k.keyword)
      
      // 生成日期范围（最近30天）
      const dateRange: string[] = []
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
        dateRange.push(date.toISOString().split('T')[0])
      }
      
      const keywordTrendData: KeywordTrendData[] = dateRange.map(date => {
        const dayKeywords = keywordTrendMap.get(date) || new Map()
        const keywords: { [key: string]: number } = {}
        topKeywords.forEach(keyword => {
          keywords[keyword] = dayKeywords.get(keyword) || 0
        })
        return { date, keywords }
      })

      // 计算趋势数据（最近30天，按公众号分组，使用文章发布时间）
      const trendMap = new Map<string, Map<string, number>>() // date -> mp_name -> count
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const thirtyDaysAgoTimestamp = Math.floor(thirtyDaysAgo.getTime() / 1000) // 秒级时间戳
      
      // 生成完整的日期范围（最近30天）
      const trendDateRange: string[] = []
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
        const dateKey = date.toISOString().split('T')[0]
        trendDateRange.push(dateKey)
        trendMap.set(dateKey, new Map())
      }
      
      // 获取所有公众号名称
      const allMpNames = new Set<string>()
      
      articles.forEach((article: any) => {
        // 使用 publish_time（时间戳）而不是 created_at
        const publishTime = article.publish_time
        if (publishTime && typeof publishTime === 'number' && publishTime >= thirtyDaysAgoTimestamp) {
          // 将时间戳转换为日期
          const timestamp = publishTime
          const timestampLength = timestamp.toString().length
          // 处理秒级和毫秒级时间戳
          const adjustedTimestamp = timestampLength <= 10 ? timestamp * 1000 : timestamp
          const publishDate = new Date(adjustedTimestamp)
          
          if (publishDate && !isNaN(publishDate.getTime())) {
            const dateKey = publishDate.toISOString().split('T')[0]
            const mpName = article.mp_name || '未知来源'
            allMpNames.add(mpName)
            
            const dayMap = trendMap.get(dateKey) || new Map()
            dayMap.set(mpName, (dayMap.get(mpName) || 0) + 1)
            trendMap.set(dateKey, dayMap)
          }
        }
      })

      // 生成趋势数据，每个日期包含所有公众号的统计
      const trendData: TrendData[] = trendDateRange.map(date => {
        const dayMap = trendMap.get(date) || new Map()
        const sources: { [mp_name: string]: number } = {}
        allMpNames.forEach(mpName => {
          sources[mpName] = dayMap.get(mpName) || 0
        })
        return {
          date,
          sources
        }
      })

      setDashboardData({
      stats: {
          totalArticles,
          totalSources,
          todayArticles,
          weekArticles
      },
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

  // 来源统计饼图配置
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
      label: {
        visible: true,
        style: {
          fontSize: 12,
          fill: dark ? '#E5E7EB' : '#374151'
        }
      },
      tooltip: {
        mark: {
          content: [
            {
              key: (datum: any) => datum.name,
              value: (datum: any) => `${datum.value} 篇`
            }
          ]
        }
      },
      color: getColorPalette(sourceStats.length)
    }
  }


  // 趋势散点图配置（按公众号分组，点的大小表示热点）
  const getTrendChartSpec = (trendData: TrendData[]): any => {
    const dark = isDarkMode()
    const textColor = dark ? '#E5E7EB' : '#374151'
    const gridColor = dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
    
    // 获取所有公众号名称
    const allMpNames = new Set<string>()
    trendData.forEach(item => {
      Object.keys(item.sources).forEach(mpName => {
        if (item.sources[mpName] > 0) {
          allMpNames.add(mpName)
        }
      })
    })
    const mpNamesArray = Array.from(allMpNames)
    
    // 转换数据格式：每个公众号每个日期一行
    const chartData: any[] = []
    trendData.forEach(item => {
      mpNamesArray.forEach(mpName => {
        const count = item.sources[mpName] || 0
        if (count > 0) { // 只显示有数据的点
          chartData.push({
            date: item.date,
            mp_name: mpName,
            count: count
          })
        }
      })
    })
    
    // 计算最大文章数，用于归一化点的大小
    const maxCount = Math.max(...chartData.map(item => item.count), 1)
    // 点的大小范围：最小10，最大40
    const minSize = 10
    const maxSize = 40
    
    // 获取颜色调色板
    const colors = getColorPalette(mpNamesArray.length)
    
    return {
      type: 'scatter',
      background: 'transparent',
      data: {
        values: chartData
      },
      xField: 'date',
      yField: 'count',
      seriesField: 'mp_name',
      sizeField: 'count',
      size: {
        type: 'linear',
        range: [minSize, maxSize],
        domain: [0, maxCount]
      },
      point: {
        visible: true,
        style: {
          fillOpacity: 0.7,
          strokeWidth: 1.5
        }
      },
      color: colors,
      label: {
        visible: false
      },
      axes: [
        {
          orient: 'bottom' as const,
          type: 'band' as const,
          domainLine: { visible: true, style: { stroke: gridColor } },
          grid: { visible: true, style: { stroke: gridColor } },
          tick: { visible: true, style: { stroke: gridColor } },
          label: {
            visible: true,
            style: {
              fill: textColor,
              fontSize: 11
            },
            // 只显示部分日期标签，避免过于拥挤
            formatMethod: (value: string, index: number) => {
              // 每5天显示一个标签
              return index % 5 === 0 ? value : ''
            }
          }
        },
        {
          orient: 'left' as const,
          type: 'linear' as const,
          domainLine: { visible: true, style: { stroke: gridColor } },
          grid: { visible: true, style: { stroke: gridColor } },
          tick: { visible: true, style: { stroke: gridColor } },
          label: {
            visible: true,
            style: {
              fill: textColor,
              fontSize: 12
            }
          },
          // 确保Y轴从0开始
          zero: true
        }
      ],
      legends: {
        visible: true,
        orient: 'top' as const,
        position: 'start' as const,
        item: {
          label: {
            style: {
              fill: textColor,
              fontSize: 11
            }
          }
        }
      },
      tooltip: {
        mark: {
          content: [
            {
              key: () => '日期',
              value: (datum: any) => datum.date
            },
            {
              key: () => '公众号',
              value: (datum: any) => datum.mp_name
            },
            {
              key: () => '文章数',
              value: (datum: any) => `${datum.count} 篇`
            }
          ]
        }
      }
    }
  }

  // shadcn 标准配色调色板
  const getColorPalette = (count: number): string[] => {
    const dark = isDarkMode()
    // 使用 shadcn 标准配色，基于 HSL 值，深色模式下使用更亮的颜色
    const colors = dark ? [
      'hsl(262.1, 83.3%, 70%)', // primary
      'hsl(221.2, 83.2%, 68%)', // blue
      'hsl(199.1, 89.1%, 65%)', // cyan
      'hsl(142.1, 76.2%, 55%)', // green
      'hsl(38.7, 92%, 65%)',    // yellow
      'hsl(0, 84.2%, 70%)',     // destructive/red
      'hsl(280, 70%, 65%)',     // purple variant
      'hsl(240, 70%, 65%)',     // indigo
      'hsl(200, 80%, 65%)',     // sky
      'hsl(160, 60%, 60%)',     // teal
      'hsl(330, 70%, 70%)',     // pink
      'hsl(15, 90%, 70%)'       // orange
    ] : [
      'hsl(262.1, 83.3%, 57.8%)', // primary
      'hsl(221.2, 83.2%, 53.3%)', // blue
      'hsl(199.1, 89.1%, 48.2%)', // cyan
      'hsl(142.1, 76.2%, 36.3%)', // green
      'hsl(38.7, 92%, 50%)',      // yellow
      'hsl(0, 84.2%, 60.2%)',     // destructive/red
      'hsl(280, 70%, 50%)',       // purple variant
      'hsl(240, 70%, 50%)',       // indigo
      'hsl(200, 80%, 50%)',       // sky
      'hsl(160, 60%, 45%)',       // teal
      'hsl(330, 70%, 55%)',       // pink
      'hsl(15, 90%, 55%)'         // orange
    ]
    // 如果需要的颜色数量超过调色板，循环使用
    const result: string[] = []
    for (let i = 0; i < count; i++) {
      result.push(colors[i % colors.length])
    }
    return result
  }

  // 关键词趋势 Stack 柱状图配置
  const getKeywordStackChartSpec = (keywordTrendData: KeywordTrendData[], topKeywords: string[]) => {
    const dark = isDarkMode()
    const textColor = dark ? '#E5E7EB' : '#374151'
    const gridColor = dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
    
    // 转换数据格式：每个关键词每个日期一行
    const chartData = keywordTrendData.flatMap(item => 
      topKeywords.map(keyword => ({
        date: item.date,
        keyword,
        count: item.keywords[keyword] || 0
      }))
    )

    return {
      type: 'bar',
      background: 'transparent',
      data: {
        values: chartData
      },
      xField: 'date',
      yField: 'count',
      seriesField: 'keyword',
      stack: true,
      bar: {
        style: {
          cornerRadius: 4
        }
      },
      color: getColorPalette(topKeywords.length),
      tooltip: {
        mark: {
          content: [
            {
              key: () => '日期',
              value: (datum: any) => datum.date
            },
            {
              key: () => '关键词',
              value: (datum: any) => datum.keyword
            },
            {
              key: () => '出现次数',
              value: (datum: any) => `${datum.count} 次`
            }
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
            style: {
              fontSize: 10,
              angle: -45,
              fill: textColor
            }
          }
        },
        {
          orient: 'left' as const,
          type: 'linear' as const,
          domainLine: { visible: true, style: { stroke: gridColor } },
          grid: { visible: true, style: { stroke: gridColor } },
          tick: { visible: true, style: { stroke: gridColor } },
          label: { 
            visible: true,
            style: {
              fill: textColor,
              fontSize: 12
            }
          }
        }
      ],
      legends: {
        visible: true,
        orient: 'top' as const,
        position: 'start' as const,
        item: {
          label: {
            style: {
              fill: textColor,
              fontSize: 12
            }
          }
        }
      }
    }
  }

  // 关键词趋势折线图配置
  const getKeywordLineChartSpec = (keywordTrendData: KeywordTrendData[], topKeywords: string[]) => {
    const dark = isDarkMode()
    const textColor = dark ? '#E5E7EB' : '#374151'
    const gridColor = dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
    
    // 转换数据格式：每个关键词一条线
    const chartData = keywordTrendData.flatMap(item => 
      topKeywords.map(keyword => ({
        date: item.date,
        keyword,
        count: item.keywords[keyword] || 0
      }))
    )

    return {
      type: 'line',
      background: 'transparent',
      data: {
        values: chartData
      },
      xField: 'date',
      yField: 'count',
      seriesField: 'keyword',
      point: {
        visible: true,
        style: {
          size: 3
        }
      },
      line: {
        style: {
          lineWidth: 2
        }
      },
      color: getColorPalette(topKeywords.length),
      tooltip: {
        mark: {
          content: [
            {
              key: () => '日期',
              value: (datum: any) => datum.date
            },
            {
              key: () => '关键词',
              value: (datum: any) => datum.keyword
            },
            {
              key: () => '出现次数',
              value: (datum: any) => `${datum.count} 次`
            }
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
            style: {
              fontSize: 10,
              angle: -45,
              fill: textColor
            }
          }
        },
        {
          orient: 'left' as const,
          type: 'linear' as const,
          domainLine: { visible: true, style: { stroke: gridColor } },
          grid: { visible: true, style: { stroke: gridColor } },
          tick: { visible: true, style: { stroke: gridColor } },
          label: { 
            visible: true,
            style: {
              fill: textColor,
              fontSize: 12
            }
          }
        }
      ],
      legends: {
        visible: true,
        orient: 'top' as const,
        position: 'start' as const,
        item: {
          label: {
            style: {
              fill: textColor,
              fontSize: 12
            }
          }
        }
      }
    }
  }

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
    sourceStats: [],
    keywordStats: [],
    trendData: [],
    keywordTrendData: []
  }

  const topKeywords = keywordStats.slice(0, 10).map(k => k.keyword)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-foreground">
          数据概览
        </h1>
        <p className="text-muted-foreground text-sm">
          查看您的订阅数据和统计信息
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-6">
            <Statistic
              title="总文章数"
              value={stats.totalArticles}
              prefix={<FileText className="h-5 w-5 text-primary" />}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <Statistic
              title="来源数量"
              value={stats.totalSources}
              prefix={<User className="h-5 w-5 text-primary" />}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <Statistic
              title="今日新增"
              value={stats.todayArticles}
              prefix={<Calendar className="h-5 w-5 text-primary" />}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <Statistic
              title="本周新增"
              value={stats.weekArticles}
              prefix={<Flame className="h-5 w-5 text-primary" />}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* 来源分布图表 */}
        <Card className="h-[400px]">
          <CardHeader>
            <CardTitle className="text-base font-semibold">来源分布</CardTitle>
          </CardHeader>
          <CardContent>
            {sourceStats.length > 0 ? (
              <VChart
                spec={getSourceChartSpec(sourceStats)}
                style={{ height: '320px' }}
              />
            ) : (
              <div className="flex justify-center items-center h-[320px] text-muted-foreground">
                暂无数据
              </div>
            )}
          </CardContent>
        </Card>

        {/* 趋势图表 */}
        <Card className="h-[400px]">
          <CardHeader>
            <CardTitle className="text-base font-semibold">抓取趋势</CardTitle>
          </CardHeader>
          <CardContent>
            {trendData.length > 0 && trendData.some(item => 
              Object.values(item.sources).some(count => count > 0)
            ) ? (
              <VChart
                spec={getTrendChartSpec(trendData)}
                style={{ height: '320px' }}
              />
            ) : (
              <div className="flex justify-center items-center h-[320px] text-muted-foreground">
                暂无数据
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 热词统计 */}
      <div className="mb-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center w-full">
              <CardTitle className="text-base font-semibold">热门关键词</CardTitle>
              <div className="flex gap-2">
                <RadioGroup
                  value={keywordViewMode}
                  onValueChange={(value: string) => setKeywordViewMode(value as 'tags' | 'chart')}
                  type="button"
                  size="small"
                >
                  <Radio value="tags" button size="small">标签视图</Radio>
                  <Radio value="chart" button size="small">趋势图表</Radio>
                </RadioGroup>
                {keywordViewMode === 'chart' && keywordTrendData.length > 0 && (
                  <RadioGroup
                    value={keywordChartType}
                    onValueChange={(value: string) => setKeywordChartType(value as 'stack' | 'line')}
                    type="button"
                    size="small"
                  >
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
                <div className="mb-5 flex flex-wrap gap-3">
                  {keywordStats.slice(0, 20).map((item, index) => (
                    <Badge
                      key={index}
                      variant={index < 3 ? "default" : "secondary"}
                      className="text-sm px-4 py-2 font-normal"
                    >
                      {item.keyword} ({item.count})
                    </Badge>
                  ))}
                </div>
                {keywordTrendData.length > 0 && topKeywords.length > 0 && (
                  <div className="mt-6 h-[400px]">
                    <VChart
                      spec={
                        keywordChartType === 'stack'
                          ? getKeywordStackChartSpec(keywordTrendData, topKeywords)
                          : getKeywordLineChartSpec(keywordTrendData, topKeywords)
                      }
                      style={{ height: '400px' }}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-muted-foreground py-10">
                暂无数据
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default Dashboard
