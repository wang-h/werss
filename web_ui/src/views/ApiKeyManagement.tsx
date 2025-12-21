import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import { Message } from '@/utils/message'
import { Plus, Edit, Trash2, Copy, RefreshCw, Search, Loader2, Eye, EyeOff, Key } from 'lucide-react'
import { useForm } from 'react-hook-form'
import {
  getApiKeys,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  getApiKeyLogs,
  regenerateApiKey
} from '@/api/apiKey'
import type {
  ApiKey,
  ApiKeyLog,
  ApiKeyListResponse,
  ApiKeyLogListResponse,
  CreateApiKeyParams,
  UpdateApiKeyParams
} from '@/types/apiKey'
import { formatDateTime } from '@/utils/date'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTranslation } from 'react-i18next'

// 权限选项列表
const PERMISSION_OPTIONS = [
  { value: 'read', label: '读' },
  { value: 'read_write', label: '读写' },
]

const ApiKeyManagement: React.FC = () => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [selectedApiKey, setSelectedApiKey] = useState<ApiKey | null>(null)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  })
  const [searchText, setSearchText] = useState('')
  const [visible, setVisible] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false)
  const [regenerateTargetId, setRegenerateTargetId] = useState<string | null>(null)
  const [newApiKey, setNewApiKey] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({})
  const [logs, setLogs] = useState<ApiKeyLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsPagination, setLogsPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  })

  const form = useForm<CreateApiKeyParams & UpdateApiKeyParams>({
    defaultValues: {
      name: '',
      permissions: null,
      is_active: true
    }
  })

  // 加载 API Key 列表
  const loadApiKeys = async () => {
    setLoading(true)
    try {
      const res = await getApiKeys({
        page: pagination.current,
        pageSize: pagination.pageSize
      }) as unknown as ApiKeyListResponse

      const list = res.list || []
      const total = res.total || 0

      // 过滤搜索文本
      const filteredList = searchText
        ? list.filter((key: ApiKey) => key.name.toLowerCase().includes(searchText.toLowerCase()))
        : list

      setApiKeys(filteredList)
      setPagination(prev => ({ ...prev, total: searchText ? filteredList.length : total }))
    } catch (error: any) {
      console.error('获取 API Key 列表失败:', error)
      Message.error(error.message || t('apiKeys.messages.fetchFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadApiKeys()
  }, [pagination.current, pagination.pageSize])

  useEffect(() => {
    // 搜索时重新加载
    const timer = setTimeout(() => {
      if (pagination.current === 1) {
        loadApiKeys()
      } else {
        setPagination(prev => ({ ...prev, current: 1 }))
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchText])

  // 加载使用日志
  const loadLogs = async (apiKeyId: string) => {
    if (!apiKeyId) return
    setLogsLoading(true)
    try {
      const res = await getApiKeyLogs(apiKeyId, {
        page: logsPagination.current,
        pageSize: logsPagination.pageSize
      }) as unknown as ApiKeyLogListResponse

      const list = res.list || []
      const total = res.total || 0

      setLogs(list)
      setLogsPagination(prev => ({ ...prev, total }))
    } catch (error: any) {
      console.error('获取使用日志失败:', error)
      Message.error(error.message || t('apiKeys.messages.fetchLogsFailed'))
    } finally {
      setLogsLoading(false)
    }
  }

  // 选择 API Key
  const handleSelectApiKey = (apiKey: ApiKey) => {
    setSelectedApiKey(apiKey)
    setLogsPagination(prev => ({ ...prev, current: 1 }))
    loadLogs(apiKey.id)
  }

  // 创建 API Key
  const handleCreate = () => {
    setIsEditing(false)
    form.reset({
      name: '',
      permissions: null,
      is_active: true
    })
    setVisible(true)
  }

  // 编辑 API Key
  const handleEdit = (apiKey: ApiKey) => {
    setIsEditing(true)
    form.reset({
      name: apiKey.name,
      permissions: apiKey.permissions || null, // 保持为 JSON 字符串格式
      is_active: apiKey.is_active
    })
    setSelectedApiKey(apiKey)
    setVisible(true)
  }

  // 保存 API Key
  const handleSave = async () => {
    try {
      const values = form.getValues()
      // 确保 permissions 格式正确
      const submitData = {
        ...values,
        permissions: values.permissions || null // 确保 null 而不是 undefined
      }
      
      if (isEditing && selectedApiKey) {
        await updateApiKey(selectedApiKey.id, submitData)
        Message.success(t('apiKeys.messages.updateSuccess'))
      } else {
        const res = await createApiKey(submitData)
        const newKey = (res as any)?.data?.key || (res as any)?.key
        if (newKey) {
          setNewApiKey(newKey)
          Message.success(t('apiKeys.messages.createSuccess'))
        } else {
          Message.success(t('apiKeys.messages.createSuccessSimple'))
        }
      }
      setVisible(false)
      setNewApiKey(null)
      loadApiKeys()
      if (selectedApiKey && isEditing) {
        const updated = apiKeys.find(k => k.id === selectedApiKey.id)
        if (updated) {
          setSelectedApiKey(updated)
        }
      }
    } catch (error: any) {
      console.error('保存 API Key 失败:', error)
      const errorMessage = error?.response?.data?.detail?.message || 
                          error?.response?.data?.message || 
                          error?.message || 
                          '保存失败'
      Message.error(errorMessage)
    }
  }

  // 删除 API Key
  const handleDelete = async (id: string) => {
    try {
      await deleteApiKey(id)
      Message.success(t('apiKeys.messages.deleteSuccess'))
      if (selectedApiKey?.id === id) {
        setSelectedApiKey(null)
        setLogs([])
      }
      loadApiKeys()
    } catch (error: any) {
      Message.error(error.message || t('apiKeys.messages.deleteFailed'))
    }
  }

  // 重新生成 API Key
  const handleRegenerate = async (id: string) => {
    try {
      const res = await regenerateApiKey(id)
      const newKey = (res as any)?.data?.key || (res as any)?.key
      if (newKey) {
        setNewApiKey(newKey)
        Message.success(t('apiKeys.messages.regenerateSuccess'))
      } else {
        Message.success(t('apiKeys.messages.regenerateSuccessSimple'))
      }
      setRegenerateDialogOpen(false)
      setRegenerateTargetId(null)
      loadApiKeys()
    } catch (error: any) {
      Message.error(error.message || t('apiKeys.messages.regenerateFailed'))
    }
  }

  // 复制到剪贴板
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      Message.success(t('apiKeys.messages.copySuccess'))
    } catch (error) {
      Message.error(t('apiKeys.messages.copyFailed'))
    }
  }

  // 切换显示/隐藏 API Key
  const toggleShowApiKey = (id: string) => {
    setShowApiKey(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const totalPages = Math.ceil(pagination.total / pagination.pageSize)

  return (
    <div className="p-6 min-h-[calc(100vh-64px)] w-full box-border overflow-hidden">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-foreground">
          API Key 管理
        </h1>
        <p className="text-muted-foreground text-sm">
          管理和查看您的 API Key，支持权限绑定和使用日志记录
        </p>
      </div>

      <div className="flex gap-4 items-start w-full overflow-hidden h-[calc(100vh-200px)]">
        {/* 左侧：API Key 列表 */}
        <div className="w-[480px] bg-background rounded-lg shadow-sm border flex flex-col flex-shrink-0 overflow-hidden">
          {/* 搜索和添加按钮区域 */}
          <div className="p-5 border-b">
            <div className="flex gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索 API Key 名称..."
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value)
                    setPagination(prev => ({ ...prev, current: 1 }))
                  }}
                  className="pl-8"
                />
              </div>
            </div>
            <Button className="w-full" onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              创建 API Key
            </Button>
          </div>

          {/* 表格区域 */}
          <div className="flex-1 overflow-auto p-4">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead className="text-center">状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={2} className="h-24 text-center">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : apiKeys.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="h-24 text-center text-muted-foreground">
                        暂无数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    apiKeys.map((record) => (
                      <TableRow
                        key={record.id}
                        className={`cursor-pointer transition-all ${
                          selectedApiKey?.id === record.id
                            ? 'bg-primary/10 border-l-4 border-l-primary'
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => handleSelectApiKey(record)}
                      >
                        <TableCell className="font-medium">
                          {record.name}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={record.is_active ? 'default' : 'destructive'} className="rounded">
                            <span className="dark:text-dark">{record.is_active ? '已启用' : '已禁用'}</span>
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="mt-4">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault()
                          if (pagination.current > 1) {
                            setPagination(prev => ({ ...prev, current: prev.current - 1 }))
                          }
                        }}
                        className={pagination.current <= 1 ? 'pointer-events-none opacity-50' : ''}
                      />
                    </PaginationItem>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let pageNum: number
                      if (totalPages <= 5) {
                        pageNum = i + 1
                      } else if (pagination.current <= 3) {
                        pageNum = i + 1
                      } else if (pagination.current >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = pagination.current - 2 + i
                      }
                      return (
                        <PaginationItem key={pageNum}>
                          <PaginationLink
                            href="#"
                            onClick={(e) => {
                              e.preventDefault()
                              setPagination(prev => ({ ...prev, current: pageNum }))
                            }}
                            isActive={pagination.current === pageNum}
                          >
                            {pageNum}
                          </PaginationLink>
                        </PaginationItem>
                      )
                    })}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => {
                          e.preventDefault()
                          if (pagination.current < totalPages) {
                            setPagination(prev => ({ ...prev, current: prev.current + 1 }))
                          }
                        }}
                        className={pagination.current >= totalPages ? 'pointer-events-none opacity-50' : ''}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </div>
        </div>

        {/* 右侧：API Key 详情 */}
        <div className="flex-1 min-w-[400px] max-w-full flex flex-col overflow-hidden">
          {selectedApiKey ? (
            <Card className="rounded-lg shadow-sm border bg-background w-full overflow-hidden h-full flex flex-col">
              <CardHeader className="pb-5 pt-6 px-6 flex flex-col gap-4">
                <div className="flex md:flex-row flex-col items-center gap-4 flex-1 min-w-0 w-full">
                  <div className="flex items-center gap-4 flex-1 min-w-0 w-full">
                    <div className="h-14 w-14 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Key className="h-7 w-7 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xl font-bold text-foreground mb-1 overflow-hidden text-ellipsis whitespace-nowrap">
                        {selectedApiKey.name}
                      </div>
                      <div className="text-xs text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                        ID: {selectedApiKey.id}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button variant="outline" onClick={() => handleEdit(selectedApiKey)}>
                      <Edit className="h-4 w-4 mr-2" />
                      编辑
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setRegenerateTargetId(selectedApiKey.id)
                        setRegenerateDialogOpen(true)
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      重新生成
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        setDeleteTargetId(selectedApiKey.id)
                        setDeleteDialogOpen(true)
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      删除
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-6 pb-6 flex-1 overflow-auto">
                <Tabs defaultValue="details" className="w-full">
                  <TabsList>
                    <TabsTrigger value="details">详情</TabsTrigger>
                    <TabsTrigger value="logs">使用日志</TabsTrigger>
                  </TabsList>
                  <TabsContent value="details" className="space-y-4 mt-4">
                    {/* API Key 值 */}
                    <div className="p-5 bg-muted/50 rounded-lg border">
                      <div className="text-muted-foreground text-xs mb-3 font-semibold">
                        API Key
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 px-3 py-2 bg-background rounded text-sm font-mono break-all">
                          {showApiKey[selectedApiKey.id] ? (selectedApiKey.key || '密钥不可用（仅在创建/重新生成时显示）') : '•'.repeat(32)}
                        </code>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleShowApiKey(selectedApiKey.id)}
                        >
                          {showApiKey[selectedApiKey.id] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => selectedApiKey.key && handleCopy(selectedApiKey.key)}
                          disabled={!selectedApiKey.key}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* 状态 */}
                    <div className="p-5 bg-muted/50 rounded-lg border">
                      <div className="text-muted-foreground text-xs mb-3 font-semibold">
                        状态
                      </div>
                      <div>
                        <Badge
                          variant={selectedApiKey.is_active ? 'default' : 'destructive'}
                          className="text-sm px-4 py-1.5 rounded-md font-medium"
                        >
                          <span className="dark:text-foreground">
                            {selectedApiKey.is_active ? '已启用' : '已禁用'}
                          </span>
                        </Badge>
                      </div>
                    </div>

                    {/* 权限 */}
                    <div className="p-5 bg-muted/50 rounded-lg border">
                      <div className="text-muted-foreground text-xs mb-3 font-semibold">
                        权限
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          // 直接使用字符串，不再解析 JSON
                          const permission = selectedApiKey.permissions
                          if (permission) {
                            const option = PERMISSION_OPTIONS.find(opt => opt.value === permission)
                            return (
                              <Badge variant="secondary">
                                {option ? option.label : permission}
                              </Badge>
                            )
                          }
                          return (
                            <span className="text-sm text-muted-foreground">无特定权限限制</span>
                          )
                        })()}
                      </div>
                    </div>

                    {/* 最后使用时间 */}
                    <div className="p-5 bg-muted/50 rounded-lg border">
                      <div className="text-muted-foreground text-xs mb-3 font-semibold">
                        最后使用时间
                      </div>
                      <div className="text-sm text-foreground font-medium">
                        {selectedApiKey.last_used_at
                          ? formatDateTime(selectedApiKey.last_used_at)
                          : '从未使用'}
                      </div>
                    </div>

                    {/* 创建时间 */}
                    <div className="p-5 bg-muted/50 rounded-lg border">
                      <div className="text-muted-foreground text-xs mb-3 font-semibold">
                        创建时间
                      </div>
                      <div className="text-sm text-foreground font-medium">
                        {formatDateTime(selectedApiKey.created_at)}
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="logs" className="mt-4">
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>时间</TableHead>
                            <TableHead>接口</TableHead>
                            <TableHead>方法</TableHead>
                            <TableHead>IP</TableHead>
                            <TableHead className="text-center">状态码</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {logsLoading ? (
                            <TableRow>
                              <TableCell colSpan={5} className="h-24 text-center">
                                <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                              </TableCell>
                            </TableRow>
                          ) : logs.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                暂无日志
                              </TableCell>
                            </TableRow>
                          ) : (
                            logs.map((log) => (
                              <TableRow key={log.id}>
                                <TableCell className="text-sm">
                                  {formatDateTime(log.created_at)}
                                </TableCell>
                                <TableCell className="text-sm font-mono">{log.endpoint}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{log.method}</Badge>
                                </TableCell>
                                <TableCell className="text-sm">{log.ip_address}</TableCell>
                                <TableCell className="text-center">
                                  <Badge
                                    variant={
                                      log.status_code >= 200 && log.status_code < 300
                                        ? 'default'
                                        : 'destructive'
                                    }
                                  >
                                    {log.status_code}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    {Math.ceil(logsPagination.total / logsPagination.pageSize) > 1 && (
                      <div className="mt-4">
                        <Pagination>
                          <PaginationContent>
                            <PaginationItem>
                              <PaginationPrevious
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault()
                                  if (logsPagination.current > 1) {
                                    setLogsPagination(prev => ({ ...prev, current: prev.current - 1 }))
                                    loadLogs(selectedApiKey.id)
                                  }
                                }}
                                className={logsPagination.current <= 1 ? 'pointer-events-none opacity-50' : ''}
                              />
                            </PaginationItem>
                            <PaginationItem>
                              <PaginationLink
                                href="#"
                                isActive
                              >
                                {logsPagination.current} / {Math.ceil(logsPagination.total / logsPagination.pageSize)}
                              </PaginationLink>
                            </PaginationItem>
                            <PaginationItem>
                              <PaginationNext
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault()
                                  if (logsPagination.current < Math.ceil(logsPagination.total / logsPagination.pageSize)) {
                                    setLogsPagination(prev => ({ ...prev, current: prev.current + 1 }))
                                    loadLogs(selectedApiKey.id)
                                  }
                                }}
                                className={
                                  logsPagination.current >= Math.ceil(logsPagination.total / logsPagination.pageSize)
                                    ? 'pointer-events-none opacity-50'
                                    : ''
                                }
                              />
                            </PaginationItem>
                          </PaginationContent>
                        </Pagination>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-lg shadow-sm border bg-background min-h-[500px] flex items-center justify-center">
              <CardContent className="text-center">
                <p className="text-muted-foreground text-base">
                  请从左侧列表选择一个 API Key 查看详情
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* 创建/编辑弹窗 */}
      <Dialog open={visible} onOpenChange={setVisible}>
        <DialogContent className="max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{isEditing ? '编辑 API Key' : '创建 API Key'}</DialogTitle>
            <DialogDescription>
              {isEditing ? '修改 API Key 的基本信息和权限设置' : '创建一个新的 API Key，用于访问系统 API'}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>名称 <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input {...field} required placeholder="请输入 API Key 名称" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="permissions"
                render={({ field }) => {
                  // 直接使用字符串，不再解析 JSON
                  const selectedPermission = typeof field.value === 'string' ? field.value : ''

                  const handlePermissionChange = (value: string) => {
                    // 直接使用字符串，不再使用 JSON
                    field.onChange(value || null)
                  }

                  return (
                    <FormItem>
                      <FormLabel>权限</FormLabel>
                      <Select value={selectedPermission} onValueChange={handlePermissionChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="请选择权限" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PERMISSION_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )
                }}
              />
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">启用状态</FormLabel>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setVisible(false)}>
                  取消
                </Button>
                <Button type="submit">保存</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* 新 API Key 显示弹窗 */}
      <Dialog open={!!newApiKey} onOpenChange={() => setNewApiKey(null)}>
        <DialogContent className="max-w-[600px]">
          <DialogHeader>
            <DialogTitle>API Key 创建成功</DialogTitle>
            <DialogDescription>
              请立即保存此 API Key，创建后无法再次查看完整内容
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <code className="text-sm font-mono break-all">{newApiKey}</code>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                if (newApiKey) {
                  handleCopy(newApiKey)
                }
              }}
            >
              <Copy className="h-4 w-4 mr-2" />
              复制到剪贴板
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewApiKey(null)}>已保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除这个 API Key 吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTargetId) {
                  handleDelete(deleteTargetId)
                  setDeleteDialogOpen(false)
                  setDeleteTargetId(null)
                }
              }}
            >
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 重新生成确认对话框 */}
      <AlertDialog open={regenerateDialogOpen} onOpenChange={setRegenerateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认重新生成</AlertDialogTitle>
            <AlertDialogDescription>
              确定要重新生成这个 API Key 吗？旧的 API Key 将立即失效，请确保已更新所有使用该 Key 的应用。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (regenerateTargetId) {
                  handleRegenerate(regenerateTargetId)
                }
              }}
            >
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default ApiKeyManagement

