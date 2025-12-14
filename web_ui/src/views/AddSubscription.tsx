import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { AutoComplete } from '@/components/extensions/autocomplete'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { PageHeader } from '@/components/extensions/page-header'
import { useToast } from '@/hooks/use-toast'
import { addSubscription, searchBiz, getSubscriptionInfo } from '@/api/subscription'
import { ExportMPS, ImportMPS } from '@/api/export'
import { Avatar as AvatarUtil } from '@/utils/constants'
import { Download, Upload, User } from 'lucide-react'

interface FormValues {
  name: string
  wx_id: string
  avatar: string
  description: string
}

const AddSubscription: React.FC = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [modalVisible, setModalVisible] = useState(false)
  const [articleLink, setArticleLink] = useState('')

  const form = useForm<FormValues>({
    defaultValues: {
      name: '',
      wx_id: '',
      avatar: '',
      description: ''
    },
    mode: 'onChange'
  })

  const avatar = form.watch('avatar')

  const handleSearch = async (value: string) => {
    if (!value) {
      setSearchResults([])
      return
    }
    try {
      const res = await searchBiz(value, {
        page: 0,
        pageSize: 10
      }) as unknown as { list?: any[]; data?: { list?: any[] } }
      setSearchResults(res.list || res.data?.list || [])
    } catch (error) {
      setSearchResults([])
    }
  }

  const handleGetMpInfo = async () => {
    if (isFetching) return false
    if (!articleLink) {
      toast({
        variant: "destructive",
        title: "错误",
        description: "请提供一个公众号文章链接"
      })
      return false
    }
    setIsFetching(true)
    try {
      const res = await getSubscriptionInfo(articleLink.trim()) as unknown as { mp_info?: any; data?: { mp_info?: any } }
      console.log('获取公众号信息:', res)
      const info = res?.mp_info || res?.data?.mp_info || false
      if (info) {
        form.setValue('name', info.mp_name || '')
        form.setValue('description', info.mp_name || '')
        form.setValue('wx_id', info.biz || '')
        form.setValue('avatar', info.logo || '')
      }
    } catch (error) {
      console.error('获取公众号信息失败:', error)
      toast({
        variant: "destructive",
        title: "错误",
        description: "获取公众号信息失败"
      })
      return false
    } finally {
      setIsFetching(false)
    }
    setModalVisible(false)
    return true
  }

  const handleSelect = (item: any) => {
    console.log(item)
    form.setValue('name', item.nickname)
    form.setValue('wx_id', item.fakeid)
    form.setValue('description', item.signature)
    form.setValue('avatar', item.round_head_img)
  }

  const onSubmit = async (values: FormValues) => {
    setLoading(true)
    try {
      await addSubscription({
        mp_name: values.name,
        mp_id: values.wx_id,
        avatar: values.avatar,
        mp_intro: values.description
      })

      toast({
        title: "成功",
        description: "订阅添加成功"
      })
      navigate('/')
    } catch (error: any) {
      console.error('订阅添加失败:', error)
      toast({
        variant: "destructive",
        title: "错误",
        description: error.message || '订阅添加失败，请稍后重试'
      })
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    form.reset()
    setSearchResults([])
  }

  const goBack = () => {
    navigate(-1)
  }

  const openDialog = () => {
    setModalVisible(true)
  }

  // 导出订阅列表
  const handleExport = async () => {
    try {
      const response = await ExportMPS()
      const data = (response as any).data ?? response
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/csv;charset=utf-8' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = '公众号列表.csv'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast({
        title: "成功",
        description: "导出成功"
      })
    } catch (error: any) {
      console.error('导出失败:', error)
      toast({
        variant: "destructive",
        title: "错误",
        description: error?.message || '导出失败，请稍后重试'
      })
    }
  }

  // 导入订阅列表
  const handleImport = async () => {
    try {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.csv'
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return
        
        const formData = new FormData()
        formData.append('file', file)
        
        try {
          setLoading(true)
          const response: any = await ImportMPS(formData)
          const message = response?.message || response?.data?.message || '导入成功'
          const stats = response?.data?.stats || response?.stats
          
          if (stats) {
            toast({
              title: "成功",
              description: `${message}，新增: ${stats.imported}，更新: ${stats.updated}，跳过: ${stats.skipped}`
            })
          } else {
            toast({
              title: "成功",
              description: message
            })
          }
          
          // 导入成功后返回订阅管理页面
          setTimeout(() => {
            navigate('/subscriptions')
          }, 1500)
        } catch (error: any) {
          console.error('导入失败:', error)
          toast({
            variant: "destructive",
            title: "错误",
            description: error?.message || '导入失败，请检查CSV文件格式'
          })
        } finally {
          setLoading(false)
        }
      }
      input.click()
    } catch (error: any) {
      console.error('导入失败:', error)
      toast({
        variant: "destructive",
        title: "错误",
        description: error?.message || '导入失败，请稍后重试'
      })
    }
  }

  const avatarUrl = avatar ? AvatarUtil(avatar) : '/static/default-avatar.png'

  return (
    <div className="p-5 max-w-[800px] mx-auto">
      <PageHeader
        title="添加订阅"
        subTitle="添加新的公众号订阅"
        onBack={goBack}
      />

      <Card>
        <CardHeader>
          <CardTitle>订阅信息</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex gap-2">
              <Button onClick={openDialog} variant="outline">
                通过公众号文章获取
              </Button>
              <Button onClick={handleExport} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                导出订阅
              </Button>
              <Button onClick={handleImport} variant="outline" disabled={loading}>
                <Upload className="h-4 w-4 mr-2" />
                导入订阅
              </Button>
            </div>
          </div>

          {modalVisible && (
            <div className="mb-4 flex gap-2">
              <Input
                value={articleLink}
                onChange={(e) => setArticleLink(e.target.value)}
                placeholder="请输入一个公众号文章链接地址"
                className="max-w-[300px]"
              />
              <Button onClick={handleGetMpInfo} disabled={isFetching}>
                {isFetching ? '获取中...' : '获取'}
              </Button>
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                rules={{
                  required: '请输入公众号名称',
                  minLength: { value: 2, message: '公众号名称长度应在2-30个字符之间' },
                  maxLength: { value: 30, message: '公众号名称长度应在2-30个字符之间' }
                }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>公众号名称</FormLabel>
                    <FormControl>
                      <AutoComplete
                        {...field}
                        placeholder="请输入公众号名称或搜索"
                        data={searchResults.map((item) => ({
                          value: item.nickname,
                          name: item.nickname
                        }))}
                        onSearch={handleSearch}
                        onSelect={(value) => {
                          const item = searchResults.find((r) => r.nickname === value)
                          if (item) {
                            handleSelect(item)
                          }
                        }}
                        className="max-w-[300px]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="avatar"
                rules={{
                  required: '请选择公众号头像',
                  validate: (value) => {
                    if (!value || !value.startsWith('http')) {
                      return '请选择有效的头像URL'
                    }
                    return true
                  }
                }}
                render={() => (
                  <FormItem>
                    <FormLabel>头像</FormLabel>
                    <FormControl>
                      <Avatar className="h-20 w-20">
                        <AvatarImage src={avatarUrl} alt="avatar" />
                        <AvatarFallback>头像</AvatarFallback>
                      </Avatar>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="wx_id"
                rules={{
                  required: '请输入公众号ID',
                  pattern: {
                    value: /^[a-zA-Z0-9_=-]+$/,
                    message: '公众号ID只能包含字母、数字、下划线、横线和等号'
                  }
                }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>公众号ID</FormLabel>
                    <FormControl>
                      <div className="relative max-w-[300px]">
                        <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          {...field}
                          readOnly
                          placeholder="请输入公众号ID"
                          className="pl-10"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                rules={{
                  maxLength: { value: 200, message: '描述不能超过200个字符' }
                }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>描述</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="请输入公众号描述"
                        rows={3}
                        className="max-w-[500px]"
                      />
                    </FormControl>
                    <FormDescription>最多200个字符</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-2">
                <Button type="submit" disabled={loading}>
                  {loading ? '添加中...' : '添加订阅'}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  重置
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export default AddSubscription
