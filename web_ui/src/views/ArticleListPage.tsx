import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/hooks/use-toast'
import { getArticles, deleteArticle as deleteArticleApi, ArticleListResult, Article, fetchArticleContent, getArticleDetail } from '@/api/article'
import { getSubscriptions, SubscriptionListResult } from '@/api/subscription'
import { formatDateTime, formatTimestamp } from '@/utils/date'
import dayjs from 'dayjs'
import ExportModal from '@/components/ExportModal'
import { Plus, Trash2, Download, Wifi, ChevronDown, Loader2 } from 'lucide-react'

const ArticleListPage: React.FC = () => {
  const [loading, setLoading] = useState(false)
  const [articles, setArticles] = useState<Article[]>([])
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([])
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
  const [fetchingContent, setFetchingContent] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null)
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false)
  const exportModalRef = React.useRef<any>(null)
  const { toast } = useToast()

  // 加载订阅列表（用于筛选）
  const loadMpList = async () => {
    try {
      const res = await getSubscriptions({
        page: 0,
        pageSize: 100
      }) as unknown as SubscriptionListResult

      const list = res.list || res.data?.list || []
      setMpList(list.map(item => ({
        mp_id: item.mp_id,
        mp_name: item.mp_name || item.mp_id
      })))
    } catch (error) {
      console.error('获取订阅列表失败:', error)
    }
  }

  // 加载文章列表
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
      
      if (Array.isArray(res)) {
        list = res
        total = res.length
      } else if (res && typeof res === 'object') {
        list = (res as any)?.list || (res as any)?.data?.list || []
        total = (res as any)?.total || (res as any)?.data?.total || 0
      }
      
      setArticles(list)
      setPagination(prev => ({ ...prev, total }))
    } catch (error: any) {
      console.error('获取文章列表失败:', error)
      toast({
        variant: "destructive",
        title: "错误",
        description: error.message || '获取文章列表失败'
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMpList()
  }, [])

  useEffect(() => {
    loadArticles()
  }, [pagination.current, pagination.pageSize, searchText, mpId])

  // 查看文章
  const viewArticle = async (article: Article) => {
    setCurrentArticle(article)
    setArticleModalVisible(true)
    
    try {
      const res = await getArticleDetail(article.id, 0)
      const articleData = (res as any)?.data || res
      if (articleData) {
        setCurrentArticle({
          ...article,
          ...articleData,
          mp_name: articleData.mp_name || article.mp_name
        })
      }
    } catch (error) {
      console.error('获取文章详情失败:', error)
    }
  }

  // 删除文章
  const handleDelete = async (id: number) => {
    setDeleteTargetId(id)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!deleteTargetId) return
    try {
      await deleteArticleApi(deleteTargetId)
      toast({
        title: "成功",
        description: "删除成功"
      })
      setDeleteDialogOpen(false)
      setDeleteTargetId(null)
      loadArticles()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "错误",
        description: error.message || '删除失败'
      })
    }
  }

  // 批量删除
  const handleBatchDelete = () => {
    if (selectedRowKeys.length === 0) {
      toast({
        variant: "destructive",
        title: "警告",
        description: "请选择要删除的文章"
      })
      return
    }
    setBatchDeleteDialogOpen(true)
  }

  const confirmBatchDelete = async () => {
    try {
      await Promise.all(selectedRowKeys.map(id => deleteArticleApi(id)))
      toast({
        title: "成功",
        description: "删除成功"
      })
      setSelectedRowKeys([])
      setBatchDeleteDialogOpen(false)
      loadArticles()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "错误",
        description: error.message || '删除失败'
      })
    }
  }

  // 打开RSS订阅
  const openRssFeed = (format: string) => {
    const baseUrl = window.location.origin
    const feedUrl = mpId
      ? `${baseUrl}/feed/mp/${mpId}.${format}`
      : `${baseUrl}/feed/all.${format}`
    window.open(feedUrl, '_blank')
  }

  const toggleRowSelection = (id: number) => {
    setSelectedRowKeys(prev => 
      prev.includes(id) 
        ? prev.filter(key => key !== id)
        : [...prev, id]
    )
  }

  const toggleAllSelection = () => {
    if (selectedRowKeys.length === articles.length) {
      setSelectedRowKeys([])
    } else {
      setSelectedRowKeys(articles.map(a => a.id))
    }
  }

  const totalPages = Math.ceil(pagination.total / pagination.pageSize)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-foreground">
          文章列表
        </h1>
        <p className="text-muted-foreground text-sm">
          浏览和管理您的所有文章
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle>文章管理</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => exportModalRef.current?.show()}
            >
              <Download className="h-4 w-4 mr-2" />
              导出
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Wifi className="h-4 w-4 mr-2" />
                  订阅
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => openRssFeed('atom')}>ATOM</DropdownMenuItem>
                <DropdownMenuItem onClick={() => openRssFeed('rss')}>RSS</DropdownMenuItem>
                <DropdownMenuItem onClick={() => openRssFeed('json')}>JSON</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="destructive"
              onClick={handleBatchDelete}
              disabled={selectedRowKeys.length === 0}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              批量删除
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Input
                  placeholder="搜索文章标题"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pr-10"
                />
              </div>
              <Select 
                value={mpId || "__all__"} 
                onValueChange={(value) => setMpId(value === "__all__" ? "" : value)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="选择订阅源" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">全部</SelectItem>
                  {mpList.map(mp => (
                    <SelectItem key={mp.mp_id} value={mp.mp_id}>
                      {mp.mp_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedRowKeys.length === articles.length && articles.length > 0}
                        onCheckedChange={toggleAllSelection}
                      />
                    </TableHead>
                    <TableHead className="w-[300px]">标题</TableHead>
                    <TableHead className="w-[150px]">来源</TableHead>
                    <TableHead className="w-[200px]">关键词</TableHead>
                    <TableHead className="w-[180px]">发布时间</TableHead>
                    <TableHead className="w-[100px]">状态</TableHead>
                    <TableHead className="w-[120px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : articles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        暂无数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    articles.map((article) => {
                      const tags = (article as any).tag_names || (article as any).topic_names || ((article as any).tags ? (article as any).tags.map((t: any) => t.name || t) : []) || []
                      const time = (article as any).publish_time
                      let timeDisplay = '-'
                      if (time || time === 0) {
                        if (typeof time === 'number') {
                          const timestamp = time
                          const timestampLength = timestamp.toString().length
                          const adjustedTimestamp = timestampLength <= 10 ? timestamp * 1000 : timestamp
                          const date = dayjs(adjustedTimestamp)
                          if (date.isValid() && date.year() >= 1970 && date.year() < 2100) {
                            timeDisplay = formatTimestamp(timestamp)
                          }
                        } else {
                          timeDisplay = formatDateTime(time as string)
                        }
                      }
                      
                      return (
                        <TableRow key={article.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedRowKeys.includes(article.id)}
                              onCheckedChange={() => toggleRowSelection(article.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <a
                              href="#"
                              onClick={(e) => {
                                e.preventDefault()
                                viewArticle(article)
                              }}
                              className="text-purple-600 hover:underline break-words"
                              title={article.title}
                            >
                              {article.title}
                            </a>
                          </TableCell>
                          <TableCell>{article.mp_name}</TableCell>
                          <TableCell>
                            {tags.length === 0 ? (
                              <span className="text-muted-foreground text-xs">无</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {tags.slice(0, 3).map((tag: string, index: number) => (
                                  <Badge key={index} variant="secondary" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                                {tags.length > 3 && (
                                  <span className="text-muted-foreground text-xs">+{tags.length - 3}</span>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{timeDisplay}</TableCell>
                          <TableCell>
                            {article.status === 1 ? (
                              <Badge className="bg-green-500">正常</Badge>
                            ) : article.status === 2 ? (
                              <Badge variant="destructive">已删除</Badge>
                            ) : (
                              <Badge variant="outline">未知</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  toast({
                                    title: "提示",
                                    description: "插入功能待实现"
                                  })
                                }}
                                title="插入"
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(article.id)}
                                title="删除"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
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

            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  共 {pagination.total} 条，第 {pagination.current} / {totalPages} 页
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination(prev => ({ ...prev, current: Math.max(1, prev.current - 1) }))}
                    disabled={pagination.current === 1}
                  >
                    上一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination(prev => ({ ...prev, current: Math.min(totalPages, prev.current + 1) }))}
                    disabled={pagination.current === totalPages}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>确定要删除这篇文章吗？</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={confirmDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量删除确认对话框 */}
      <Dialog open={batchDeleteDialogOpen} onOpenChange={setBatchDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>确定要删除选中的 {selectedRowKeys.length} 篇文章吗？</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDeleteDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={confirmBatchDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 文章详情抽屉 */}
      <Drawer open={articleModalVisible} onOpenChange={setArticleModalVisible}>
        <DrawerContent className="max-h-[96vh]">
          <DrawerHeader>
            <DrawerTitle>{currentArticle?.title}</DrawerTitle>
            <DrawerDescription>
              {currentArticle && (
                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-2">
                  <span>来源：{currentArticle.mp_name}</span>
                  <span>发布时间：{(() => {
                    const time = (currentArticle as any).publish_time
                    if (!time && time !== 0) return '-'
                    if (typeof time === 'number') {
                      const timestamp = time
                      const timestampLength = timestamp.toString().length
                      const adjustedTimestamp = timestampLength <= 10 ? timestamp * 1000 : timestamp
                      const date = dayjs(adjustedTimestamp)
                      if (date.isValid() && date.year() >= 1970 && date.year() < 2100) {
                        return formatTimestamp(timestamp)
                      }
                      return '-'
                    }
                    return formatDateTime(time as string)
                  })()}</span>
                  {currentArticle.link && (
                    <a href={currentArticle.link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      查看原文
                    </a>
                  )}
                </div>
              )}
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4 overflow-y-auto flex-1">
            {currentArticle && (
              <>
                {(!currentArticle.content || currentArticle.content.trim() === '' || currentArticle.content === '暂无内容') && (
                  <div className="mb-4">
                    <Button
                      onClick={async () => {
                        if (!currentArticle) return
                        setFetchingContent(true)
                        try {
                          await fetchArticleContent(currentArticle.id)
                          toast({
                            title: "成功",
                            description: "正在重新获取内容，请稍后刷新查看"
                          })
                          setTimeout(async () => {
                            try {
                              const res = await getArticleDetail(currentArticle.id, 0)
                              if ((res as any).data?.data) {
                                setCurrentArticle((res as any).data.data)
                              }
                            } catch (error) {
                              console.error('刷新文章详情失败:', error)
                            }
                          }, 2000)
                        } catch (error: any) {
                          toast({
                            variant: "destructive",
                            title: "错误",
                            description: error?.response?.data?.detail?.message || error?.message || '获取内容失败'
                          })
                        } finally {
                          setFetchingContent(false)
                        }
                      }}
                      disabled={fetchingContent}
                    >
                      {fetchingContent && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      重新获取内容
                    </Button>
                  </div>
                )}
                <div
                  dangerouslySetInnerHTML={{ __html: currentArticle.content || '暂无内容 没有成功读到内容' }}
                  className="prose prose-sm max-w-none leading-relaxed"
                />
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <ExportModal ref={exportModalRef} />
    </div>
  )
}

export default ArticleListPage
