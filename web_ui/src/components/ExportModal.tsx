import React, { useState, useImperativeHandle, forwardRef } from 'react'
import { useForm } from 'react-hook-form'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Message } from '@/utils/message'
import { exportArticles } from '@/api/tools'

interface ExportModalProps {
  onConfirm?: (formData: any) => void
}

export interface ExportModalRef {
  show: (mp_id: string, ids: any[], mp_name?: string) => void
  hide: () => void
}

interface FormValues {
  scope: string
  format: string[]
  page_count: number
  mp_id: string
  ids: any[]
  add_title: boolean
  remove_images: boolean
  remove_links: boolean
  zip_filename: string
}

const ExportModal = forwardRef<ExportModalRef, ExportModalProps>(({ onConfirm }, ref) => {
  const [open, setOpen] = useState(false)
  
  const form = useForm<FormValues>({
    defaultValues: {
      scope: 'all',
      format: ['pdf', 'docx', 'json', 'csv', 'md'],
      page_count: 10,
      mp_id: '',
      ids: [],
      add_title: true,
      remove_images: false,
      remove_links: false,
      zip_filename: '',
    }
  })

  const show = (mp_id: string, ids: any[], mp_name?: string) => {
    const newFormData = {
      scope: ids && ids.length > 0 ? 'selected' : 'all',
      format: ['pdf', 'docx', 'json', 'csv', 'md'],
      page_count: 10,
      mp_id,
      ids,
      add_title: true,
      remove_images: false,
      remove_links: false,
      zip_filename: mp_name && mp_name !== '全部' ? `${mp_name}_文章.zip` : '全部文章.zip'
    }
    form.reset(newFormData)
    setOpen(true)
  }

  const hide = () => {
    setOpen(false)
  }

  useImperativeHandle(ref, () => ({
    show,
    hide
  }))

  const handleOk = async () => {
    const values = form.getValues()
    await submitExport(values)
    onConfirm?.(values)
    hide()
  }

  const submitExport = async (params: any) => {
    try {
      const result = await exportArticles(params)
      console.log('导出成功:', result)
      Message.success(result.message || '导出成功！')
    } catch (error) {
      console.error('导出失败:', error)
    }
  }

  const formatValue = form.watch('format')
  const scopeValue = form.watch('scope')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>导出设置</DialogTitle>
          <DialogDescription>配置导出选项</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="scope"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>导出范围</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="all">指定页数</SelectItem>
                      <SelectItem value="selected">已选文章</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="format"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>导出格式</FormLabel>
                  <div className="space-y-2">
                    {['csv', 'md', 'json', 'pdf', 'docx'].map((fmt) => (
                      <div key={fmt} className="flex items-center space-x-2">
                        <Checkbox
                          checked={field.value?.includes(fmt)}
                          onCheckedChange={(checked) => {
                            const current = field.value || []
                            if (checked) {
                              field.onChange([...current, fmt])
                            } else {
                              field.onChange(current.filter((f: string) => f !== fmt))
                            }
                          }}
                        />
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                          {fmt === 'csv' ? 'Excel列表' : fmt === 'md' ? 'MarDown' : fmt === 'json' ? 'JSON附加信息' : fmt === 'pdf' ? 'PDF归档' : 'WORD文档'}
                        </label>
                      </div>
                    ))}
                  </div>
                </FormItem>
              )}
            />
            {(scopeValue === 'all' || scopeValue === 'current') && (
              <FormField
                control={form.control}
                name="page_count"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>导出页数</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={10000}
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 10)}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="zip_filename"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>文件名</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="请输入导出文件名（可选）"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <div className="space-y-2">
              <FormLabel>导出选项</FormLabel>
              <FormField
                control={form.control}
                name="add_title"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>添加标题</FormLabel>
                    </div>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="remove_images"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>移除图片</FormLabel>
                    </div>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="remove_links"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>移除链接</FormLabel>
                    </div>
                  </FormItem>
                )}
              />
            </div>
          </div>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={hide}>取消</Button>
          <Button onClick={handleOk}>确定</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

ExportModal.displayName = 'ExportModal'

export default ExportModal
