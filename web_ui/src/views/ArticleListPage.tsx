import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import {
  getArticles,
  deleteArticle as deleteArticleApi,
  ArticleListResult,
  Article,
  getArticleDetail,
  updateArticle,
  UpdateArticleParams,
  analyzeArticleAiFilter,
  restoreArticleAiFilter,
  ArticleAiFilterAnalyzeResult,
} from '@/api/article'
import { getSubscriptions, SubscriptionListResult } from '@/api/subscription'
import { formatDateTime } from '@/utils/date'
import dayjs from 'dayjs'
import ExportModal from '@/components/ExportModal'
import { Trash2, Download, Wifi, ChevronDown, Loader2, Edit, Tags, Search, RotateCcw, Sparkles, RefreshCw, Undo2, EyeOff, Info, CheckCircle2, Ban } from 'lucide-react'
import { reExtractTags } from '@/api/tools'

const AI_FILTER_BATCH_SIZE = 10
const AI_FILTER_TASK_STORAGE_KEY = 'werss:article-ai-filter-task'

type AiFilterTaskStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'completed' | 'error'

interface AiFilterTaskState {
  total: number
  processed: number
  hidden: number
  keep: number
  maybe: number
  pendingIds: string[]
  currentBatchIds: string[]
  status: AiFilterTaskStatus
  source: 'selection' | 'page' | 'saved'
  errorMessage?: string
}

const ArticleListPage: React.FC = () => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [articles, setArticles] = useState<Article[]>([])
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  })
  const [searchText, setSearchText] = useState('')
  const [mpId, setMpId] = useState<string>('')
  const [mpList, setMpList] = useState<Array<{ mp_id: string; mp_name: string }>>([])
  const [articleModalVisible, setArticleModalVisible] = useState(false)
  const [currentArticle, setCurrentArticle] = useState<Article | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | number | null>(null)
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingArticle, setEditingArticle] = useState<Article | null>(null)
  const [editFormData, setEditFormData] = useState<UpdateArticleParams>({
    title: '',
    description: '',
    url: '',
    pic_url: ''
  })
  const [reExtractDialogOpen, setReExtractDialogOpen] = useState(false)
  const [reExtracting, setReExtracting] = useState(false)
  const [aiFiltering, setAiFiltering] = useState(false)
  const [aiFilterDialogOpen, setAiFilterDialogOpen] = useState(false)
  const [aiFilterTask, setAiFilterTask] = useState<AiFilterTaskState | null>(null)
  const [hideAiFiltered, setHideAiFiltered] = useState(true)
  const [jumpPageInput, setJumpPageInput] = useState('1')
  const [statusUpdatingIds, setStatusUpdatingIds] = useState<string[]>([])
  const [articleDetailLoading, setArticleDetailLoading] = useState(false)
  const exportModalRef = React.useRef<any>(null)
  const aiFilterControlRef = useRef<'running' | 'paused' | 'stopped'>('running')
  const { toast } = useToast()

  const loadMpList = async () => {
    try {
      const res = await getSubscriptions({ page: 0, pageSize: 100 }) as unknown as SubscriptionListResult
      const list = res.list || res.data?.list || []
      setMpList(list.map(item => ({ mp_id: item.mp_id, mp_name: item.mp_name || item.mp_id })))
    } catch (error) {
      console.error(t('subscriptions.messages.fetchFailed'), error)
    }
  }

  const loadArticles = async () => {
    setLoading(true)
    try {
      const res = await getArticles({
        page: pagination.current - 1,
        pageSize: pagination.pageSize,
        search: searchText,
        mp_id: mpId || undefined
      }) as unknown as ArticleListResult
      let list: Article[] = []
      let total = 0
      if (Array.isArray(res)) { list = res; total = res.length }
      else if (res && typeof res === 'object') {
        list = (res as any)?.list || (res as any)?.data?.list || []
        total = (res as any)?.total || (res as any)?.data?.total || 0
      }
      const visibleList = hideAiFiltered ? list.filter(item => item.ai_filter_status !== 'hide') : list
      setArticles(visibleList)
      setPagination(prev => ({ ...prev, total }))
      setSelectedRowKeys(prev => prev.filter(id => visibleList.some(item => String(item.id) === id)))
    } catch (error: any) {
      toast({ variant: "destructive", title: t('common.error'), description: error.message || t('articles.messages.fetchFailed') })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadMpList() }, [])
  useEffect(() => { loadArticles() }, [pagination.current, pagination.pageSize, searchText, mpId, hideAiFiltered])
  useEffect(() => {
    setJumpPageInput(String(pagination.current))
  }, [pagination.current])
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(AI_FILTER_TASK_STORAGE_KEY)
      if (!raw) return
      const savedTask = JSON.parse(raw) as AiFilterTaskState
      if (savedTask?.pendingIds?.length) {
        setAiFilterTask({
          ...savedTask,
          status: savedTask.status === 'completed' ? 'paused' : savedTask.status,
          source: 'saved',
          currentBatchIds: []
        })
      } else {
        window.localStorage.removeItem(AI_FILTER_TASK_STORAGE_KEY)
      }
    } catch {
      window.localStorage.removeItem(AI_FILTER_TASK_STORAGE_KEY)
    }
  }, [])

  const persistAiFilterTask = (task: AiFilterTaskState | null) => {
    if (!task || !task.pendingIds.length || task.status === 'completed') {
      window.localStorage.removeItem(AI_FILTER_TASK_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(AI_FILTER_TASK_STORAGE_KEY, JSON.stringify({
      ...task,
      currentBatchIds: []
    }))
  }

  const finalizeAiFilterTask = async (task: AiFilterTaskState) => {
    setAiFiltering(false)
    if (task.status === 'completed') {
      window.localStorage.removeItem(AI_FILTER_TASK_STORAGE_KEY)
      toast({
        title: t('common.success'),
        description: t('articles.aiFilter.analyzeSuccess', {
          hidden: task.hidden,
          keep: task.keep,
          maybe: task.maybe
        })
      })
      setSelectedRowKeys([])
      await loadArticles()
      return
    }

    persistAiFilterTask(task)
  }

  const runAiFilterTask = async (initialTask: AiFilterTaskState) => {
    aiFilterControlRef.current = 'running'
    setAiFiltering(true)

    let task = { ...initialTask, status: 'running' as const, errorMessage: undefined }
    setAiFilterTask(task)
    persistAiFilterTask(task)

    while (task.pendingIds.length > 0) {
      if (aiFilterControlRef.current === 'paused') {
        task = { ...task, status: 'paused', currentBatchIds: [] }
        setAiFilterTask(task)
        await finalizeAiFilterTask(task)
        return
      }

      if (aiFilterControlRef.current === 'stopped') {
        task = { ...task, status: 'stopped', currentBatchIds: [] }
        setAiFilterTask(task)
        await finalizeAiFilterTask(task)
        return
      }

      const batchIds = task.pendingIds.slice(0, AI_FILTER_BATCH_SIZE)
      task = { ...task, currentBatchIds: batchIds }
      setAiFilterTask(task)

      try {
        const res = await analyzeArticleAiFilter(batchIds)
        const data = (res as any)?.data || res
        const summary = (data as ArticleAiFilterAnalyzeResult)?.summary || {}

        task = {
          ...task,
          processed: task.processed + batchIds.length,
          hidden: task.hidden + (summary.hidden || 0),
          keep: task.keep + (summary.keep || 0),
          maybe: task.maybe + (summary.maybe || 0),
          pendingIds: task.pendingIds.slice(batchIds.length),
          currentBatchIds: [],
        }

        setAiFilterTask(task)
        persistAiFilterTask(task)
      } catch (error: any) {
        task = {
          ...task,
          status: 'error',
          currentBatchIds: [],
          errorMessage: error?.response?.data?.message || error?.message || t('articles.aiFilter.analyzeFailed')
        }
        setAiFilterTask(task)
        await finalizeAiFilterTask(task)
        toast({
          variant: 'destructive',
          title: t('common.error'),
          description: task.errorMessage
        })
        return
      }
    }

    task = {
      ...task,
      status: 'completed',
      currentBatchIds: [],
      pendingIds: []
    }
    setAiFilterTask(task)
    await finalizeAiFilterTask(task)
  }

  const processedArticleHtml = (record: { content?: string }) => {
    const raw = record?.content
    if (!raw) return ''
    return String(raw)
      .replace(/(<img[^>]*src=["'])(?!\/static\/res\/logo\/)([^"']*)/g, '$1/static/res/logo/$2')
      .replace(/<img([^>]*)width=["'][^"']*["']([^>]*)>/g, '<img$1$2>')
  }

  const viewArticle = async (article: Article, actionType: number = 0) => {
    setArticleModalVisible(true)
    setArticleDetailLoading(true)
    try {
      const res = await getArticleDetail(article.id, actionType)
      const articleData = (res as any)?.data || res
      if (articleData) {
        setCurrentArticle({
          ...article,
          ...articleData,
          mp_name: articleData.mp_name || article.mp_name,
          content: processedArticleHtml(articleData),
        } as Article)
      }
    } catch (error: any) {
      console.error(t('articles.messages.fetchDetailFailed'), error)
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: error?.message || t('articles.messages.fetchDetailFailed'),
      })
      setArticleModalVisible(false)
    } finally {
      setArticleDetailLoading(false)
    }
  }

  const handleEdit = (article: Article) => {
    setEditingArticle(article)
    setEditFormData({ title: article.title || '', description: (article as any).description || '', url: article.link || (article as any).url || '', pic_url: (article as any).pic_url || '' })
    setEditDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editingArticle) return
    try {
      await updateArticle(editingArticle.id, editFormData)
      toast({ title: t('common.success'), description: t('articles.messages.updateSuccess') })
      setEditDialogOpen(false); setEditingArticle(null); loadArticles()
    } catch (error: any) {
      toast({ variant: "destructive", title: t('common.error'), description: error.message || t('articles.messages.updateFailed') })
    }
  }

  const handleDelete = async (id: string | number) => { setDeleteTargetId(id); setDeleteDialogOpen(true) }
  const confirmDelete = async () => {
    if (!deleteTargetId) return
    try {
      await deleteArticleApi(deleteTargetId as any)
      toast({ title: t('common.success'), description: t('articles.messages.deleteSuccess') })
      setDeleteDialogOpen(false); setDeleteTargetId(null); loadArticles()
    } catch (error: any) { toast({ variant: "destructive", title: t('common.error'), description: error.message || t('articles.messages.deleteFailed') }) }
  }

  const handleReExtractTags = () => {
    if (selectedRowKeys.length === 0) { toast({ variant: "destructive", title: t('common.warning'), description: t('articles.messages.selectFirst') }); return }
    setReExtractDialogOpen(true)
  }

  const confirmReExtractTags = async () => {
    setReExtracting(true)
    try {
      const res = await reExtractTags(selectedRowKeys)
      const data = (res as any)?.data || res
      toast({ title: t('common.success'), description: data?.message || t('articles.messages.fetchContentSuccess') })
      loadArticles()
      setSelectedRowKeys([])
      setReExtractDialogOpen(false)
    } catch (error: any) {
      toast({ variant: "destructive", title: t('common.error'), description: error?.response?.data?.message || error?.message || t('articles.messages.fetchContentFailed') })
    }
    finally { setReExtracting(false) }
  }

  const handleAiFilterCurrentPage = async () => {
    if (aiFilterTask?.pendingIds?.length && aiFilterTask.status !== 'completed') {
      setAiFilterDialogOpen(true)
      return
    }

    const targetArticles = selectedRowKeys.length > 0
      ? articles.filter(article => selectedRowKeys.includes(String(article.id)))
      : articles

    if (targetArticles.length === 0) {
      toast({ variant: "destructive", title: t('common.warning'), description: t('articles.aiFilter.selectFirst') })
      return
    }

    const nextTask: AiFilterTaskState = {
      total: targetArticles.length,
      processed: 0,
      hidden: 0,
      keep: 0,
      maybe: 0,
      pendingIds: targetArticles.map(article => String(article.id)),
      currentBatchIds: [],
      status: 'idle',
      source: selectedRowKeys.length > 0 ? 'selection' : 'page'
    }
    setAiFilterTask(nextTask)
    setAiFilterDialogOpen(true)
    runAiFilterTask(nextTask)
  }

  const handleResumeAiFilterTask = () => {
    if (!aiFilterTask || !aiFilterTask.pendingIds.length) return
    setAiFilterDialogOpen(true)
    runAiFilterTask({ ...aiFilterTask, status: 'running' })
  }

  const handlePauseAiFilterTask = () => {
    aiFilterControlRef.current = 'paused'
  }

  const handleStopAiFilterTask = () => {
    aiFilterControlRef.current = 'stopped'
  }

  const handleCloseAiFilterDialog = (open: boolean) => {
    if (!open && aiFiltering) return
    setAiFilterDialogOpen(open)
  }

  const handleRestoreAiFilter = async (article: Article) => {
    try {
      await restoreArticleAiFilter([article.id])
      toast({ title: t('common.success'), description: t('articles.aiFilter.restoreSuccess') })
      loadArticles()
    } catch (error: any) {
      toast({ variant: "destructive", title: t('common.error'), description: error?.response?.data?.message || error?.message || t('articles.aiFilter.restoreFailed') })
    }
  }

  const handleToggleArticleStatus = async (article: Article) => {
    const nextStatus = article.status === 1 ? 2 : 1
    const articleId = String(article.id)
    setStatusUpdatingIds(prev => [...prev, articleId])
    setArticles(prev => prev.map(item => (
      String(item.id) === articleId ? { ...item, status: nextStatus } : item
    )))
    try {
      await updateArticle(article.id, { status: nextStatus })
      toast({
        title: t('common.success'),
        description: nextStatus === 1 ? t('articles.status.enabled') : t('articles.status.disabled'),
      })
    } catch (error: any) {
      setArticles(prev => prev.map(item => (
        String(item.id) === articleId ? { ...item, status: article.status } : item
      )))
      toast({ variant: "destructive", title: t('common.error'), description: error.message || t('articles.messages.updateFailed') })
    } finally {
      setStatusUpdatingIds(prev => prev.filter(id => id !== articleId))
    }
  }

  const handleBatchDelete = () => {
    if (selectedRowKeys.length === 0) { toast({ variant: "destructive", title: t('common.warning'), description: t('articles.messages.selectFirst') }); return }
    setBatchDeleteDialogOpen(true)
  }

  const confirmBatchDelete = async () => {
    try {
      await Promise.all(selectedRowKeys.map(id => deleteArticleApi(id as any)))
      toast({ title: t('common.success'), description: t('articles.messages.batchDeleteSuccess', { count: selectedRowKeys.length }) })
      setSelectedRowKeys([]); setBatchDeleteDialogOpen(false); loadArticles()
    } catch (error: any) { toast({ variant: "destructive", title: t('common.error'), description: error.message || t('articles.messages.batchDeleteFailed') }) }
  }

  const openRssFeed = (format: string) => {
    const baseUrl = window.location.origin
    const feedUrl = mpId ? `${baseUrl}/feed/mp/${mpId}.${format}` : `${baseUrl}/feed/all.${format}`
    window.open(feedUrl, '_blank')
  }

  const handleExportClick = () => {
    const selectedIds = (selectedRowKeys || []).slice()
    let currentMpId = mpId || ''
    let mpName = t('common.all') || '全部'
    if (selectedIds.length > 0) {
      const selectedArticles = articles.filter(art => selectedRowKeys.includes(String(art.id)))
      if (selectedArticles.length > 0) {
        const mpIds = selectedArticles.map(art => (art as any).mp_id).filter(Boolean)
        const uniqueMpIds = [...new Set(mpIds)]
        if (uniqueMpIds.length === 1) {
          currentMpId = uniqueMpIds[0]
          const currentMp = mpList.find(mp => mp.mp_id === currentMpId)
          mpName = currentMp?.mp_name || selectedArticles[0].mp_name || '全部'
        } else { currentMpId = 'all'; mpName = '全部' }
      }
    } else {
      if (!currentMpId) currentMpId = 'all'
      const currentMp = mpList.find(mp => mp.mp_id === currentMpId)
      mpName = currentMp?.mp_name || '全部'
    }
    exportModalRef.current?.show(currentMpId, selectedIds, mpName)
  }

  const toggleRowSelection = (id: string | number) => {
    const idStr = String(id)
    setSelectedRowKeys(prev => prev.includes(idStr) ? prev.filter(key => key !== idStr) : [...prev, idStr])
  }

  const toggleAllSelection = () => {
    if (selectedRowKeys.length === articles.length) setSelectedRowKeys([])
    else setSelectedRowKeys(articles.map(a => String(a.id)))
  }

  const totalPages = Math.ceil(pagination.total / pagination.pageSize)

  const handleJumpPage = () => {
    const targetPage = Number.parseInt(jumpPageInput, 10)
    if (Number.isNaN(targetPage)) {
      setJumpPageInput(String(pagination.current))
      return
    }

    const nextPage = Math.min(Math.max(targetPage, 1), Math.max(1, totalPages))
    setPagination(prev => ({ ...prev, current: nextPage }))
    setJumpPageInput(String(nextPage))
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('articles.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('articles.subtitle') || t('articles.title')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleExportClick} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            {t('articles.export')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Wifi className="h-4 w-4 mr-2" />
                RSS
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openRssFeed('atom')}>ATOM</DropdownMenuItem>
              <DropdownMenuItem onClick={() => openRssFeed('rss')}>RSS</DropdownMenuItem>
              <DropdownMenuItem onClick={() => openRssFeed('json')}>JSON</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Filter Card */}
      <Card>
        <CardHeader>
          <CardTitle>{t('articles.refreshSettings')}</CardTitle>
          <CardDescription>{t('articles.refreshSettingsDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row items-center gap-4">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('common.search')}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex items-center gap-3 w-full md:w-auto">
                <Select
                  value={mpId || "__all__"}
                  onValueChange={(value) => setMpId(value === "__all__" ? "" : value)}
                >
                  <SelectTrigger className="w-full md:w-[200px]">
                    <SelectValue placeholder={t('common.all')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{t('common.all')}</SelectItem>
                    {mpList.map(mp => (
                      <SelectItem key={mp.mp_id} value={mp.mp_id}>
                        {mp.mp_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => { setSearchText(''); setMpId(''); }}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-3">
                <Switch checked={hideAiFiltered} onCheckedChange={setHideAiFiltered} />
                <div>
                  <div className="text-sm font-medium">{t('articles.aiFilter.hideLabel')}</div>
                  <div className="text-xs text-muted-foreground">{t('articles.aiFilter.hideDesc')}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleAiFilterCurrentPage} disabled={aiFiltering || loading}>
                  {aiFiltering ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  {t('articles.aiFilter.run')}
                </Button>
                {aiFilterTask?.pendingIds?.length ? (
                  <Button variant="secondary" onClick={handleResumeAiFilterTask} disabled={aiFiltering || loading}>
                    {t('articles.aiFilter.resume')}
                  </Button>
                ) : null}
                <Button variant="secondary" onClick={() => loadArticles()} disabled={loading}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t('common.refresh')}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Batch Actions */}
      {selectedRowKeys.length > 0 && (
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-4">
              <Checkbox
                checked={true}
                onCheckedChange={toggleAllSelection}
                className="border-white data-[state=checked]:bg-white data-[state=checked]:text-primary"
              />
              <span>{t('common.selected', { count: selectedRowKeys.length })}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={handleReExtractTags}>
                <Tags className="h-4 w-4 mr-2" />
                {t('articles.refresh')}
              </Button>
              <Button size="sm" variant="destructive" onClick={handleBatchDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                {t('articles.batchDelete')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedRowKeys.length === articles.length && articles.length > 0}
                      onCheckedChange={toggleAllSelection}
                    />
                  </TableHead>
                  <TableHead>{t('articles.columns.title') || '标题'}</TableHead>
                  <TableHead>{t('articles.columns.source') || '来源'}</TableHead>
                  <TableHead>{t('articles.columns.tags') || '标签'}</TableHead>
                  <TableHead>{t('articles.columns.publishTime') || '发布时间'}</TableHead>
                  <TableHead className="text-right">{t('articles.columns.actions') || t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                ) : articles.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">{t('common.noData')}</TableCell></TableRow>
                ) : (
                  articles.map((article) => {
                    const tags = (article as any).tag_names || (article as any).topic_names || ((article as any).tags ? (article as any).tags.map((t: any) => t.name || t) : []) || []
                    const statusBadgeClassName = article.status === 1
                      ? "gap-1 cursor-pointer select-none border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white"
                      : "gap-1 cursor-pointer select-none border border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 hover:text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                    const time = (article as any).publish_time
                    let timeDisplay = '-'
                    if (time || time === 0) {
                      if (typeof time === 'number') {
                        const timestamp = time
                        const adjustedTimestamp = timestamp.toString().length <= 10 ? timestamp * 1000 : timestamp
                        const date = dayjs(adjustedTimestamp)
                        if (date.isValid() && date.year() >= 1970 && date.year() < 2100) timeDisplay = date.format('YYYY-MM-DD')
                      } else timeDisplay = dayjs(time).format('YYYY-MM-DD')
                    }

                    return (
                      <TableRow key={article.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedRowKeys.includes(String(article.id))}
                            onCheckedChange={() => toggleRowSelection(article.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <a
                              href="#"
                              onClick={(e) => { e.preventDefault(); viewArticle(article) }}
                              className="text-emerald-600 hover:underline break-words cursor-pointer font-medium"
                            >
                              {article.title}
                            </a>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleToggleArticleStatus(article)}
                                disabled={statusUpdatingIds.includes(String(article.id))}
                                className="inline-flex items-center"
                              >
                                <Badge
                                  variant="outline"
                                  className={statusBadgeClassName}
                                >
                                  {statusUpdatingIds.includes(String(article.id)) ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : article.status === 1 ? (
                                    <CheckCircle2 className="h-3 w-3" />
                                  ) : (
                                    <Ban className="h-3 w-3" />
                                  )}
                                  {article.status === 1 ? t('common.enabled') : t('common.disabled')}
                                </Badge>
                              </button>
                              {article.ai_filter_status && (
                                <Badge
                                  variant={article.ai_filter_status === 'hide' ? 'destructive' : article.ai_filter_status === 'maybe' ? 'secondary' : 'outline'}
                                  className="gap-1"
                                >
                                  {article.ai_filter_status === 'hide' ? <EyeOff className="h-3 w-3" /> : <Info className="h-3 w-3" />}
                                  {t(`articles.aiFilter.status.${article.ai_filter_status}`)}
                                </Badge>
                              )}
                              <button
                                onClick={() => handleEdit(article)}
                                className="text-xs text-muted-foreground hover:text-primary"
                              >
                                <Edit className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{article.mp_name}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {tags.length === 0 ? (
                              <Badge variant="outline">{t('common.noData')}</Badge>
                            ) : (
                              tags.slice(0, 3).map((tag: string, idx: number) => (
                                <Badge key={idx} variant="outline">{tag}</Badge>
                              ))
                            )}
                            {tags.length > 3 && <span className="text-xs text-muted-foreground">+{tags.length - 3}</span>}
                          </div>
                        </TableCell>
                        <TableCell>{timeDisplay}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {article.ai_filter_status === 'hide' && (
                              <Button variant="ghost" size="sm" onClick={() => handleRestoreAiFilter(article)}>
                                <Undo2 className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(article.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t">
              <div className="text-sm text-muted-foreground">
                {t('common.page', { current: pagination.current, total: totalPages, count: pagination.total })}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{t('common.gotoPage')}</span>
                  <Input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={jumpPageInput}
                    onChange={(e) => setJumpPageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleJumpPage()
                      }
                    }}
                    onBlur={handleJumpPage}
                    className="h-8 w-20"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPagination(prev => ({ ...prev, current: Math.max(1, prev.current - 1) }))}
                  disabled={pagination.current === 1}
                >
                  {t('common.previousPage')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPagination(prev => ({ ...prev, current: Math.min(totalPages, prev.current + 1) }))}
                  disabled={pagination.current === totalPages}
                >
                  {t('common.nextPage')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('articles.delete')}</DialogTitle>
            <DialogDescription>{t('common.confirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={confirmDelete}>{t('common.delete')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Delete Confirmation Dialog */}
      <Dialog open={batchDeleteDialogOpen} onOpenChange={setBatchDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('articles.batchDelete')}</DialogTitle>
            <DialogDescription>{t('common.confirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDeleteDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={confirmBatchDelete}>{t('common.delete')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('articles.edit')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">{t('articles.columns.title') || '标题'}</label>
              <Input
                value={editFormData.title}
                onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('subscriptions.description')}</label>
              <Textarea
                value={editFormData.description}
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSaveEdit}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Re-extract Tags Dialog */}
      <Dialog open={reExtractDialogOpen} onOpenChange={setReExtractDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('articles.refresh')}</DialogTitle>
            <DialogDescription>{t('common.confirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReExtractDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={confirmReExtractTags} disabled={reExtracting}>
              {reExtracting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={aiFilterDialogOpen} onOpenChange={handleCloseAiFilterDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('articles.aiFilter.taskTitle')}</DialogTitle>
            <DialogDescription>{t('articles.aiFilter.taskDesc')}</DialogDescription>
          </DialogHeader>
          {aiFilterTask ? (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>{t('articles.aiFilter.progress')}</span>
                  <span>{aiFilterTask.processed} / {aiFilterTask.total}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${aiFilterTask.total > 0 ? (aiFilterTask.processed / aiFilterTask.total) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg border p-3">
                  <div className="text-muted-foreground">{t('articles.aiFilter.status.hide')}</div>
                  <div className="text-lg font-semibold">{aiFilterTask.hidden}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-muted-foreground">{t('articles.aiFilter.status.keep')}</div>
                  <div className="text-lg font-semibold">{aiFilterTask.keep}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-muted-foreground">{t('articles.aiFilter.status.maybe')}</div>
                  <div className="text-lg font-semibold">{aiFilterTask.maybe}</div>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                {aiFiltering
                  ? t('articles.aiFilter.runningHint', { count: aiFilterTask.currentBatchIds.length || AI_FILTER_BATCH_SIZE })
                  : aiFilterTask.status === 'paused'
                    ? t('articles.aiFilter.pausedHint', { count: aiFilterTask.pendingIds.length })
                    : aiFilterTask.status === 'stopped'
                      ? t('articles.aiFilter.stoppedHint', { count: aiFilterTask.pendingIds.length })
                      : aiFilterTask.status === 'completed'
                        ? t('articles.aiFilter.completedHint')
                        : aiFilterTask.status === 'error'
                          ? (aiFilterTask.errorMessage || t('articles.aiFilter.analyzeFailed'))
                          : t('articles.aiFilter.idleHint')}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiFilterDialogOpen(false)} disabled={aiFiltering}>
              {aiFilterTask?.status === 'completed' ? t('common.done') : t('common.cancel')}
            </Button>
            {aiFiltering ? (
              <>
                <Button variant="outline" onClick={handlePauseAiFilterTask}>
                  {t('articles.aiFilter.pause')}
                </Button>
                <Button variant="destructive" onClick={handleStopAiFilterTask}>
                  {t('articles.aiFilter.stop')}
                </Button>
              </>
            ) : aiFilterTask?.pendingIds?.length ? (
              <Button onClick={handleResumeAiFilterTask}>
                {t('articles.aiFilter.resume')}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Drawer open={articleModalVisible} onOpenChange={setArticleModalVisible}>
        <DrawerContent className="h-[80vh] max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle id="article-reader-title">{currentArticle?.title || ''}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-8 overflow-auto flex-1 min-h-0">
            {articleDetailLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : currentArticle ? (
              <>
                <div className="mb-4 text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-2">
                  <a
                    href={(currentArticle as any).url || currentArticle.link || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline text-primary"
                  >
                    {t('articles.reader.viewOriginal')}
                  </a>
                  <span>
                    {t('articles.reader.updatedAt')}：{formatDateTime((currentArticle as any).created_at || currentArticle.created_at)}
                  </span>
                  <button
                    type="button"
                    className="hover:underline text-primary"
                    onClick={() => viewArticle(currentArticle, -1)}
                  >
                    {t('articles.reader.prevArticle')}
                  </button>
                  <button
                    type="button"
                    className="hover:underline text-primary"
                    onClick={() => viewArticle(currentArticle, 1)}
                  >
                    {t('articles.reader.nextArticle')}
                  </button>
                </div>
                <div
                  className="max-w-none text-foreground [&_img]:max-w-full [&_img]:h-auto"
                  dangerouslySetInnerHTML={{ __html: (currentArticle as any).content || '' }}
                />
              </>
            ) : null}
          </div>
        </DrawerContent>
      </Drawer>

      <ExportModal ref={exportModalRef} />
    </div>
  )
}

export default ArticleListPage
