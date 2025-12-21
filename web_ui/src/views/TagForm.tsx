import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Upload } from '@/components/extensions/upload'
import { Message } from '@/utils/message'
import { getTag, createTag, updateTag } from '@/api/tagManagement'
import type { TagCreate } from '@/types/tagManagement'
import { uploadFile } from '@/api/file'
import MpMultiSelect from '@/components/MpMultiSelect'
import { Image, Edit, ArrowLeft } from 'lucide-react'

const TagForm: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdit = !!id
  const [loading, setLoading] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [showMpSelector, setShowMpSelector] = useState(false)
  const form = useForm<TagCreate & { mps_id: any[] }>({
    defaultValues: {
      name: '',
      cover: '',
      intro: '',
      status: 1,
      mps_id: []
    },
    mode: 'onChange'
  })

  useEffect(() => {
    if (id) {
      fetchTag(id)
    }
  }, [id])

  const fetchTag = async (tagId: string) => {
    try {
      setLoading(true)
      const res = await getTag(tagId)
      const data = (res as any).data || res
      form.reset({
        ...data,
        mps_id: JSON.parse(data.mps_id || '[]')
      })
    } catch (error) {
      Message.error('获取标签详情失败')
    } finally {
      setLoading(false)
    }
  }

  const handleUploadChange = async (fileList: any[]): Promise<void> => {
    const file = fileList[0]?.originFile || fileList[0]?.file

    if (!file?.type?.startsWith('image/')) {
      Message.error('请选择图片文件 (JPEG/PNG)')
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      Message.error('图片大小不能超过2MB')
      return
    }

    try {
      const res = await uploadFile(file)
      console.log(res)
      const data = (res as any).data || res
      form.setValue('cover', data.url)
    } catch (error: any) {
      console.error('上传错误:', error)
      Message.error(`上传失败: ${error.response?.data?.message || error.message || '服务器错误'}`)
    }
    return
  }

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.target as HTMLImageElement
    img.src = '/default-cover.png'
  }

  const handleSubmit = async (values: TagCreate & { mps_id: any[] }) => {
    try {
      setFormLoading(true)
      const submitData = {
        ...values,
        mps_id: JSON.stringify(values.mps_id || [])
      }

      if (isEdit) {
        await updateTag(id!, submitData)
        Message.success('更新成功')
      } else {
        await createTag(submitData)
        Message.success('创建成功')
      }
      navigate('/tags')
    } catch (error) {
      Message.error(isEdit ? '更新失败' : '创建失败')
    } finally {
      setFormLoading(false)
    }
  }

  const cover = form.watch('cover')
  const mpsId = form.watch('mps_id') || []

  return (
    <div className="p-5 max-w-[800px] mx-auto">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回
        </Button>
        <h1 className="text-2xl font-semibold mb-1">
          {isEdit ? '编辑标签' : '添加标签'}
        </h1>
        <p className="text-sm text-muted-foreground">标签信息</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isEdit ? '编辑标签' : '添加标签'}</CardTitle>
          <CardDescription>填写标签的基本信息</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground">加载中...</div>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>标签名称</FormLabel>
                      <FormControl>
                        <Input placeholder="请输入标签名称" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cover"
                  render={() => (
                    <FormItem>
                      <FormLabel>封面图</FormLabel>
                      <FormControl>
                        <Upload
                          customRequest={handleUploadChange}
                          showUploadList={false}
                          accept="image/*"
                          limit={1}
                        >
                          <div className="relative w-[120px] h-[120px] cursor-pointer border border-dashed rounded group overflow-hidden">
                            {cover ? (
                              <img
                                src={cover}
                                alt="cover"
                                onError={handleImageError}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Image className="h-8 w-8 text-muted-foreground" />
                              </div>
                            )}
                            <div className="absolute top-0 left-0 w-full h-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                              <Edit className="h-6 w-6 text-white" />
                            </div>
                          </div>
                        </Upload>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="intro"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>简介</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="请输入标签简介"
                          rows={3}
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>状态</FormLabel>
                      <Select
                        value={field.value?.toString()}
                        onValueChange={(value) => field.onChange(parseInt(value))}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="请选择标签状态" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1">启用</SelectItem>
                          <SelectItem value="0">禁用</SelectItem>
                          <SelectItem value="2">屏蔽</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="mps_id"
                  render={() => (
                    <FormItem>
                      <FormLabel>公众号</FormLabel>
                      <div className="flex gap-2">
                        <Input
                          value={mpsId.map((mp: any) => mp.id?.toString() || '').join(',')}
                          placeholder="请选择公众号"
                          readOnly
                          className="flex-1 max-w-[300px]"
                        />
                        <Button
                          type="button"
                          onClick={() => setShowMpSelector(true)}
                        >
                          选择
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2">
                  <Button type="submit" disabled={formLoading}>
                    {formLoading ? '提交中...' : '提交'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                    取消
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>

      <Dialog open={showMpSelector} onOpenChange={setShowMpSelector}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>选择公众号</DialogTitle>
            <DialogDescription>选择要关联的公众号</DialogDescription>
          </DialogHeader>
          <MpMultiSelect
            value={mpsId}
            onChange={(value) => form.setValue('mps_id', value)}
          />
          <div className="flex justify-end mt-4">
            <Button onClick={() => setShowMpSelector(false)}>
              确定
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default TagForm
