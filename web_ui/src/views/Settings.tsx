import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { getSettings, saveSettings, type AppSettings } from '@/utils/settings'
import { useTheme } from '@/components/theme-provider'
import { getConfig, createConfig, updateConfig } from '@/api/configManagement'
import { getSysInfo } from '@/api/sysInfo'
import dayjs from 'dayjs'
import { CalendarIcon, Loader2, Clock, Play, Pause, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

interface SchedulerInfo {
  mps: {
    running: boolean
    job_count: number
    next_run_times: [string, string | null][]
  }
  fetch: {
    running: boolean
    job_count: number
    next_run_times: [string, string | null][]
  }
}

interface MessageTask {
  id: string
  name: string
  cron_exp: string
  status: number
  mps_id: string
}

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(getSettings())
  const [collectStartDate, setCollectStartDate] = useState<Date | null>(null)
  const [tempCollectStartDate, setTempCollectStartDate] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [schedulerInfo, setSchedulerInfo] = useState<SchedulerInfo | null>(null)
  const [messageTasks, setMessageTasks] = useState<MessageTask[]>([])
  const [loadingScheduler, setLoadingScheduler] = useState(false)
  const { toast } = useToast()
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    // 监听设置变更事件
    const handleSettingsChange = (e: CustomEvent<AppSettings>) => {
      setSettings(e.detail)
    }

    window.addEventListener('settingsChanged', handleSettingsChange as EventListener)

    // 加载采集起始时间配置
    loadCollectStartDate()
    // 加载调度器状态
    loadSchedulerInfo()

    return () => {
      window.removeEventListener('settingsChanged', handleSettingsChange as EventListener)
    }
  }, [])

  // 加载调度器状态
  const loadSchedulerInfo = async () => {
    setLoadingScheduler(true)
    try {
      const res = await getSysInfo()
      const data = (res as any)?.data || res
      if (data?.scheduler) {
        setSchedulerInfo(data.scheduler)
      }
      if (data?.message_tasks) {
        setMessageTasks(data.message_tasks)
      }
    } catch (error) {
      console.error('加载调度器状态失败:', error)
    } finally {
      setLoadingScheduler(false)
    }
  }

  // 加载采集起始时间配置
  const loadCollectStartDate = async () => {
    try {
      const res = await getConfig('collect_start_date')
      const data = (res as any)?.data || res
      if (data && data.config_value) {
        const date = dayjs(data.config_value).toDate()
        setCollectStartDate(date)
        setTempCollectStartDate(date)
      } else {
        // 默认值：2025-12-01
        const defaultDate = dayjs('2025-12-01').toDate()
        setCollectStartDate(defaultDate)
        setTempCollectStartDate(defaultDate)
      }
    } catch (error: any) {
      // 如果配置不存在（404），自动创建默认配置
      if (error?.response?.status === 404 || error?.message?.includes('404')) {
        const defaultDate = dayjs('2025-12-01').toDate()
        try {
          // 自动创建默认配置，避免后续的 404 错误
          await createConfig({
            config_key: 'collect_start_date',
            config_value: dayjs(defaultDate).format('YYYY-MM-DD'),
            description: '采集数据的起始时间，格式：YYYY-MM-DD'
          })
          setCollectStartDate(defaultDate)
          setTempCollectStartDate(defaultDate)
        } catch (createError: any) {
          // 如果创建失败，仍然使用默认值
          console.warn('自动创建采集起始时间配置失败:', createError)
          setCollectStartDate(defaultDate)
          setTempCollectStartDate(defaultDate)
        }
      } else {
        console.error('加载采集起始时间配置失败:', error)
        const defaultDate = dayjs('2025-12-01').toDate()
        setCollectStartDate(defaultDate)
        setTempCollectStartDate(defaultDate)
      }
    }
  }

  // 保存采集起始时间配置
  const handleSaveCollectStartDate = async () => {
    if (!tempCollectStartDate) {
      toast({
        variant: "destructive",
        title: "警告",
        description: "请选择采集起始时间"
      })
      return
    }
    
    setLoading(true)
    try {
      const dateStr = dayjs(tempCollectStartDate).format('YYYY-MM-DD')
      try {
        // 尝试更新现有配置
        await updateConfig('collect_start_date', {
          config_key: 'collect_start_date',
          config_value: dateStr,
          description: '采集数据的起始时间，格式：YYYY-MM-DD'
        } as any)
      } catch (error: any) {
        // 如果配置不存在（404），创建新配置
        if (error?.response?.status === 404 || error?.response?.statusCode === 404 || error?.message?.includes('404') || error?.message?.includes('Config not found')) {
          await createConfig({
            config_key: 'collect_start_date',
            config_value: dateStr,
            description: '采集数据的起始时间，格式：YYYY-MM-DD'
          } as any)
        } else {
          throw error
        }
      }
      setCollectStartDate(tempCollectStartDate)
      toast({
        title: "成功",
        description: "采集起始时间已保存"
      })
    } catch (error: any) {
      console.error('保存采集起始时间失败:', error)
      const errorMessage = error?.response?.data?.detail || error?.response?.data?.message || error?.message || '保存采集起始时间失败'
      toast({
        variant: "destructive",
        title: "错误",
        description: typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage)
      })
    } finally {
      setLoading(false)
    }
  }

  const handleWatermarkChange = (enabled: boolean) => {
    const newSettings = { ...settings, watermarkEnabled: enabled }
    setSettings(newSettings)
    saveSettings(newSettings)
    toast({
      title: "成功",
      description: enabled ? '已启用水印' : '已关闭水印'
    })
  }

  const handleDarkModeChange = (enabled: boolean) => {
    const newSettings = { ...settings, darkMode: enabled }
    setSettings(newSettings)
    saveSettings(newSettings)
    // 使用新的 theme provider
    setTheme(enabled ? 'dark' : 'light')
    toast({
      title: "成功",
      description: enabled ? '已切换到暗色模式' : '已切换到亮色模式'
    })
  }

  const isDateChanged = tempCollectStartDate && collectStartDate 
    ? !dayjs(tempCollectStartDate).isSame(dayjs(collectStartDate), 'day')
    : false

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-foreground">
          应用设置
        </h1>
        <p className="text-muted-foreground text-sm">
          自定义您的应用体验
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>设置</CardTitle>
          <CardDescription>管理您的应用偏好设置</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 水印设置 */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="watermark" className="text-base">显示水印</Label>
              <p className="text-sm text-muted-foreground">
                在页面上显示版权水印信息
              </p>
            </div>
            <Switch
              id="watermark"
              checked={settings.watermarkEnabled}
              onCheckedChange={handleWatermarkChange}
            />
          </div>

          <Separator />

          {/* 暗色模式设置 */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="darkmode" className="text-base">暗色模式</Label>
              <p className="text-sm text-muted-foreground">
                使用暗色主题，减少眼部疲劳
              </p>
            </div>
            <Switch
              id="darkmode"
              checked={theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)}
              onCheckedChange={handleDarkModeChange}
            />
          </div>

          <Separator />

          {/* 采集数据起始时间设置 */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-base">采集数据起始时间</Label>
              <p className="text-sm text-muted-foreground">
                设置公众号文章采集的起始日期，系统将从该日期开始抓取文章
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[240px] justify-start text-left font-normal",
                      !tempCollectStartDate && "text-muted-foreground"
                    )}
                    disabled={loading}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {tempCollectStartDate ? (
                      format(tempCollectStartDate, "yyyy-MM-dd")
                    ) : (
                      <span>选择日期</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={tempCollectStartDate || undefined}
                    onSelect={(date) => setTempCollectStartDate(date || null)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <Button
                onClick={handleSaveCollectStartDate}
                disabled={loading || !tempCollectStartDate || !isDateChanged}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                保存
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 定时任务状态 */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            定时抓取任务
          </CardTitle>
          <CardDescription>
            查看和管理定时文章抓取任务状态
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingScheduler ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">加载中...</span>
            </div>
          ) : (
            <>
              {/* 调度器状态 */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Label className="text-base">调度器状态</Label>
                    {schedulerInfo?.mps?.running ? (
                      <Badge variant="default" className="bg-green-500">
                        <Play className="h-3 w-3 mr-1" />
                        运行中
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <Pause className="h-3 w-3 mr-1" />
                        未运行
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    文章抓取调度器 {schedulerInfo?.mps?.running ? '正在运行' : '未运行'}，共 {schedulerInfo?.mps?.job_count || 0} 个定时任务
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={loadSchedulerInfo}>
                  刷新状态
                </Button>
              </div>

              {/* 消息任务列表 */}
              {messageTasks.length > 0 ? (
                <div className="space-y-3">
                  <Separator />
                  <Label className="text-sm font-medium">定时任务列表</Label>
                  {messageTasks.map((task) => (
                    <div key={task.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{task.name}</span>
                          <Badge variant={task.status === 1 ? "default" : "secondary"}>
                            {task.status === 1 ? '已启用' : '已禁用'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Cron: {task.cron_exp}
                        </p>
                      </div>
                      {schedulerInfo?.mps?.running && schedulerInfo?.mps?.next_run_times?.length > 0 && (
                        <div className="text-right">
                          {schedulerInfo.mps.next_run_times
                            .filter(([id]) => id === task.id)
                            .map(([, time]) => (
                              <p key={task.id} className="text-xs text-muted-foreground">
                                下次: {time ? dayjs(time).format('MM-DD HH:mm:ss') : '未知'}
                              </p>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 p-4 border border-dashed rounded-lg">
                  <AlertCircle className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      暂无定时抓取任务
                    </p>
                    <p className="text-xs text-muted-foreground">
                      请到{' '}
                      <a href="/message-tasks" className="text-primary hover:underline">
                        消息任务
                      </a>
                      页面创建定时抓取任务
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default Settings
