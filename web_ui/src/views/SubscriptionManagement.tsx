import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Message } from '@/utils/message'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Plus, Edit, Trash2, RefreshCw, Search, Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { getSubscriptions, deleteSubscription, updateSubscription, SubscriptionListResult, Subscription, UpdateMps } from '@/api/subscription'
import { formatDateTime, formatTimestamp } from '@/utils/date'
import { Avatar as AvatarUtil } from '@/utils/constants'
import dayjs from 'dayjs'

const SubscriptionManagement: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()
  const [loading, setLoading] = useState(false)
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  })
  const [searchText, setSearchText] = useState('')
  const [visible, setVisible] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const form = useForm({
    defaultValues: {
      mp_id: '',
      mp_name: '',
      mp_intro: '',
      status: true
    }
  })

  // 加载订阅列表
  const loadSubscriptions = async () => {
    setLoading(true)
    try {
      const res = await getSubscriptions({
        page: pagination.current - 1,
        pageSize: pagination.pageSize,
        kw: searchText
      }) as unknown as SubscriptionListResult

      const list = res.list || res.data?.list || []
      const total = res.total || res.data?.total || 0

      setSubscriptions(list)
      setPagination(prev => ({ ...prev, total }))

      // 如果有选中的订阅，更新选中状态
      if (id && list.length > 0) {
        const found = list.find(item => item.mp_id === id)
        if (found) {
          setSelectedSubscription(found)
        }
      } else if (list.length > 0 && !selectedSubscription) {
        // 默认选中第一个
        setSelectedSubscription(list[0])
        navigate(`/subscriptions/${list[0].mp_id}`, { replace: true })
      }
    } catch (error: any) {
      console.error('获取订阅列表失败:', error)
      Message.error(error.message || t('subscriptions.messages.fetchFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSubscriptions()
  }, [pagination.current, pagination.pageSize, searchText])

  // 选择订阅
  const handleSelectSubscription = (subscription: Subscription) => {
    setSelectedSubscription(subscription)
    navigate(`/subscriptions/${subscription.mp_id}`)
  }

  // 刷新订阅（更新文章）
  const handleRefresh = async () => {
    if (!selectedSubscription) {
      Message.warning(t('subscriptions.messages.selectFirst'))
      return
    }
    setRefreshing(true)
    try {
      await UpdateMps(selectedSubscription.mp_id, {
        start_page: 0,
        end_page: 1
      })
      
      // 成功情况：显示成功消息
      Message.success(t('subscriptions.messages.refreshSuccess'))
      
      // 等待2秒后刷新订阅详情
      setTimeout(() => {
        loadSubscriptions()
      }, 2000)
    } catch (error: any) {
      console.error('刷新失败:', error)
      // 响应拦截器会 reject response.data，所以 error 可能是 response.data 对象
      // 检查多种可能的错误结构
      let errorData: any = null
      
      // 如果 error 是字符串（拦截器 reject 的字符串）
      if (typeof error === 'string') {
        console.error('刷新错误（字符串）:', error)
        Message.error(error || t('subscriptions.messages.refreshFailed'))
        return
      }
      
      // 如果 error 是对象，检查是否有 code 字段（直接是 response.data）
      if (error && typeof error === 'object' && 'code' in error) {
        errorData = error
      } else if (error?.response?.data) {
        // 如果是 axios 错误对象
        errorData = error.response.data.detail || error.response.data
      } else {
        errorData = error
      }
      
      if (errorData?.code === 40402) {
        // 刷新限制 - 显示友好的提示
        const timeSpan = errorData?.data?.time_span || 0
        const syncInterval = 60 // 默认60秒
        const remaining = Math.max(0, syncInterval - timeSpan)
        Message.warning(t('subscriptions.messages.refreshLimit', { seconds: remaining }))
      } else {
        // 其他错误显示错误消息
        const errorMsg = errorData?.message || error?.message || t('subscriptions.messages.refreshFailed')
        Message.error(errorMsg)
      }
    } finally {
      setRefreshing(false)
    }
  }

  // 删除订阅
  const handleDelete = async (mpId: string) => {
    try {
      await deleteSubscription(mpId)
      Message.success('删除成功')
      if (selectedSubscription?.mp_id === mpId) {
        setSelectedSubscription(null)
        navigate('/subscriptions', { replace: true })
      }
      loadSubscriptions()
    } catch (error: any) {
      Message.error(error.message || '删除失败')
    }
  }

  // 编辑订阅
  const handleEdit = (subscription: Subscription) => {
    form.reset({
      ...subscription,
      status: subscription.status === 1
    })
    setVisible(true)
  }

  // 保存编辑
  const handleSave = async () => {
    try {
      const values = form.getValues()
      await updateSubscription(values.mp_id, {
        ...values,
        status: values.status ? 1 : 0
      })
      Message.success('保存成功')
      setVisible(false)
      loadSubscriptions()
      if (selectedSubscription?.mp_id === values.mp_id) {
        const updated = subscriptions.find(s => s.mp_id === values.mp_id)
        if (updated) {
          setSelectedSubscription(updated)
        }
      }
    } catch (error: any) {
      Message.error(error.message || '保存失败')
    }
  }

  const subscriptionColumns: Array<{
    title: string
    dataIndex?: string
    ellipsis?: boolean
    width?: number
    align?: 'center' | 'left' | 'right'
    render?: (value: any, record: Subscription) => React.ReactNode
  }> = [
    {
      title: t('subscriptions.columns.name'),
      dataIndex: 'mp_name',
      ellipsis: true,
      render: (text: string, record: Subscription) => (
        <div
          className={`cursor-pointer font-medium transition-all ${
            selectedSubscription?.mp_id === record.mp_id ? 'text-primary font-semibold' : 'text-foreground'
          }`}
          onClick={() => handleSelectSubscription(record)}
        >
          {text || record.mp_id}
        </div>
      )
    },
    {
      title: t('subscriptions.columns.articleCount'),
      dataIndex: 'article_count',
      width: 100,
      align: 'center',
      render: (count: number) => (
        <span className="font-medium text-foreground">{count || 0}</span>
      )
    },
    {
      title: t('subscriptions.columns.status'),
      dataIndex: 'status',
      width: 100,
      align: 'center',
      render: (status: number) => (
        <Badge variant={status === 1 ? 'default' : 'destructive'} className="rounded">
          <span className="dark:text-dark">{status === 1 ? t('common.enabled') : t('common.disabled')}</span>
        </Badge>
      )
    }
  ]

  const renderPagination = () => {
    const totalPages = Math.ceil(pagination.total / pagination.pageSize)
    return (
      <div className="flex items-center justify-center mt-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPagination(prev => ({ ...prev, current: Math.max(1, prev.current - 1) }))}
            disabled={pagination.current === 1}
          >
            上一页
          </Button>
          <span className="text-sm text-muted-foreground">
            第 {pagination.current} / {totalPages} 页，共 {pagination.total} 条
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPagination(prev => ({ ...prev, current: Math.min(totalPages, prev.current + 1) }))}
            disabled={pagination.current >= totalPages}
          >
            下一页
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 min-h-[calc(100vh-64px)] w-full box-border overflow-hidden">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-foreground">
          {t('subscriptions.title')}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t('subscriptions.subtitle')}
        </p>
      </div>
      
      <div className="flex gap-4 items-start w-full overflow-hidden h-[calc(100vh-200px)]">
        {/* 左侧：订阅列表 */}
        <div className="w-[480px] bg-background rounded-lg shadow-sm border flex flex-col flex-shrink-0 overflow-hidden">
          {/* 搜索和添加按钮区域 */}
          <div className="p-5 border-b">
            <div className="flex gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('subscriptions.searchPlaceholder')}
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value)
                    setPagination(prev => ({ ...prev, current: 1 }))
                  }}
                  className="pl-8"
                />
              </div>
            </div>
            <Button
              className="w-full"
              onClick={() => navigate('/add-subscription')}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('subscriptions.addSubscription')}
            </Button>
          </div>
          
          {/* 表格区域 */}
          <div className="flex-1 overflow-auto p-4">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {subscriptionColumns.map((column, index) => (
                      <TableHead
                        key={column.dataIndex || index}
                        style={column.width ? { width: column.width } : undefined}
                        className={column.align === 'center' ? 'text-center' : ''}
                      >
                        {column.title}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={subscriptionColumns.length} className="h-24 text-center">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : subscriptions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={subscriptionColumns.length} className="h-24 text-center text-muted-foreground">
                        {t('common.noData')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    subscriptions.map((record) => (
                      <TableRow
                        key={record.mp_id}
                        className={`cursor-pointer transition-all ${
                          selectedSubscription?.mp_id === record.mp_id
                            ? 'bg-primary/10 border-l-4 border-l-primary'
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => handleSelectSubscription(record)}
                      >
                        {subscriptionColumns.map((column, colIndex) => {
                          const value = column.dataIndex ? record[column.dataIndex as keyof Subscription] : undefined
                          const content = column.render
                            ? column.render(value as any, record)
                            : value
                          return (
                            <TableCell
                              key={column.dataIndex || colIndex}
                              className={column.align === 'center' ? 'text-center' : ''}
                            >
                              {content}
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {renderPagination()}
          </div>
        </div>

        {/* 右侧：订阅详情 */}
        <div className="flex-1 min-w-[400px] max-w-full flex flex-col overflow-hidden">
          {selectedSubscription ? (
            <Card className="rounded-lg shadow-sm border bg-background w-full overflow-hidden h-full flex flex-col">
              <CardHeader className="pb-5 pt-6 px-6 flex flex-col gap-4">
              <div className="flex md:flex-row flex-col items-center gap-4 flex-1 min-w-0 w-full">
                <div className="flex items-center gap-4 flex-1 min-w-0 w-full">
                  <Avatar className="h-14 w-14 rounded-lg flex-shrink-0">
                    {(selectedSubscription as any).mp_cover || (selectedSubscription as any).avatar ? (
                      <AvatarImage 
                        src={AvatarUtil((selectedSubscription as any).mp_cover || (selectedSubscription as any).avatar)} 
                        alt={selectedSubscription.mp_name || selectedSubscription.mp_id}
                      />
                    ) : (
                      <AvatarFallback className="bg-primary text-white text-2xl font-bold rounded-lg">
                        {(selectedSubscription.mp_name || selectedSubscription.mp_id).charAt(0).toUpperCase()}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="text-xl font-bold text-foreground mb-1 overflow-hidden text-ellipsis whitespace-nowrap">
                      {selectedSubscription.mp_name || selectedSubscription.mp_id}
                    </div>
                    <div className="text-xs text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                      ID: {selectedSubscription.mp_id}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    onClick={handleRefresh}
                    disabled={refreshing}
                  >
                    {refreshing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    {t('subscriptions.refresh')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleEdit(selectedSubscription)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    {t('subscriptions.edit')}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setDeleteTargetId(selectedSubscription.mp_id)
                      setDeleteDialogOpen(true)
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('subscriptions.delete')}
                  </Button>
                </div>
                </div>
              </CardHeader>
              <CardContent className="px-6 pb-6 flex-1 overflow-auto">
                <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5 py-2 w-full box-border">
                  {/* 状态卡片 */}
                  <div className="p-5 bg-muted/50 rounded-lg border">
                    <div className="text-muted-foreground text-xs mb-3 font-semibold">
                      {t('subscriptions.details.status')}
                    </div>
                    <div>
                      <Badge 
                        variant={selectedSubscription.status === 1 ? 'default' : 'destructive'}
                        className="text-sm px-4 py-1.5 rounded-md font-medium"
                      >
                        <span className="dark:text-foreground">{selectedSubscription.status === 1 ? t('common.enabled') : t('common.disabled')}</span>
                      </Badge>
                    </div>
                  </div>

                  {/* 文章数量卡片 */}
                  <div className="p-5 bg-muted/50 rounded-lg border">
                    <div className="text-muted-foreground text-xs mb-3 font-semibold">
                      {t('subscriptions.details.articleCount')}
                    </div>
                    <div className="text-3xl font-bold text-foreground leading-none">
                      {selectedSubscription.article_count || 0}
                    </div>
                  </div>

                  {/* 最后同步卡片 */}
                  <div className="p-5 bg-muted/50 rounded-lg border">
                    <div className="text-muted-foreground text-xs mb-3 font-semibold">
                      {t('subscriptions.details.lastSync')}
                    </div>
                    <div className="text-sm text-foreground font-medium">
                      {(() => {
                        if (!selectedSubscription.sync_time) return t('common.neverUsed')
                        // 如果是数字类型，使用 formatTimestamp
                        if (typeof selectedSubscription.sync_time === 'number') {
                          // 验证时间戳是否合理（1970年之后，2100年之前）
                          const timestamp = selectedSubscription.sync_time
                          const timestampLength = timestamp.toString().length
                          const adjustedTimestamp = timestampLength <= 10 ? timestamp * 1000 : timestamp
                          const date = dayjs(adjustedTimestamp)
                          // 检查日期是否合理
                          if (date.isValid() && date.year() >= 1970 && date.year() < 2100) {
                            return formatTimestamp(timestamp)
                          }
                          return t('common.neverUsed')
                        }
                        // 如果是字符串类型，使用 formatDateTime
                        return formatDateTime(selectedSubscription.sync_time)
                      })()}
                    </div>
                  </div>

                  {/* 日期范围卡片 */}
                  {selectedSubscription.min_publish_time && selectedSubscription.max_publish_time && (
                    <div className="p-5 bg-muted/50 rounded-lg border">
                      <div className="text-muted-foreground text-xs mb-3 font-semibold">
                        {t('subscriptions.details.minPublishTime')} ~ {t('subscriptions.details.maxPublishTime')}
                      </div>
                      <div className="text-sm text-foreground font-medium">
                        {(() => {
                          const formatDate = (timestamp: number) => {
                            if (!timestamp) return t('common.unknownError')
                            const timestampLength = timestamp.toString().length
                            const adjustedTimestamp = timestampLength <= 10 ? timestamp * 1000 : timestamp
                            const date = dayjs(adjustedTimestamp)
                            // 验证日期是否合理（1970年之后，2100年之前）
                            if (date.isValid() && date.year() >= 1970 && date.year() < 2100) {
                              return date.format('YYYY-MM-DD')
                            }
                            return t('common.unknownError')
                          }
                          const startDate = formatDate(selectedSubscription.min_publish_time!)
                          const endDate = formatDate(selectedSubscription.max_publish_time!)
                          // 如果日期无效，不显示日期范围
                          if (startDate === t('common.unknownError') || endDate === t('common.unknownError')) {
                            return t('common.noData')
                          }
                          return `${startDate} ~ ${endDate}`
                        })()}
                      </div>
                    </div>
                  )}

                  {/* 简介卡片 */}
                  <div className="col-span-full p-6 bg-muted/50 rounded-lg border">
                    <div className="text-foreground text-base mb-4 font-semibold">
                      {t('subscriptions.details.description')}
                    </div>
                    <div className="text-base text-foreground/80 leading-relaxed whitespace-pre-wrap">
                      {selectedSubscription.mp_intro || t('common.noData')}
                    </div>
                  </div>

                  {/* RSS地址卡片 */}
                  {selectedSubscription.rss_url && (
                    <div className="col-span-full p-6 bg-muted/50 rounded-lg border">
                      <div className="text-foreground text-base mb-4 font-semibold">
                        {t('subscriptions.details.rssUrl')}
                      </div>
                      <div className="text-sm text-foreground break-all leading-relaxed">
                        <a 
                          href={selectedSubscription.rss_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="font-medium text-primary hover:underline"
                        >
                          {selectedSubscription.rss_url}
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card 
              className="rounded-lg shadow-sm border bg-background min-h-[500px] flex items-center justify-center"
            >
              <CardContent className="text-center">
                <p className="text-muted-foreground text-base">
                  请从左侧列表选择一个订阅查看详情
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* 编辑弹窗 */}
      <Dialog open={visible} onOpenChange={setVisible}>
        <DialogContent className="max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{t('subscriptions.edit')}</DialogTitle>
            <DialogDescription>{t('subscriptions.form.editDesc')}</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
              <FormField
                control={form.control}
                name="mp_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('subscriptions.form.name')}</FormLabel>
                    <FormControl>
                      <Input disabled {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="mp_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('subscriptions.form.name')} <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input {...field} required />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="mp_intro"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('subscriptions.form.description')}</FormLabel>
                    <FormControl>
                      <Textarea rows={4} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">{t('subscriptions.form.status')}</FormLabel>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setVisible(false)}>{t('common.cancel')}</Button>
                <Button type="submit">{t('common.save')}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('subscriptions.form.deleteConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTargetId) {
                  handleDelete(deleteTargetId)
                  setDeleteDialogOpen(false)
                  setDeleteTargetId(null)
                }
              }}
            >
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default SubscriptionManagement
