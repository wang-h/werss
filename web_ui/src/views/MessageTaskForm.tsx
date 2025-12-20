import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { RadioGroup, Radio } from '@/components/ui/radio-group-button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { getMessageTask, createMessageTask, updateMessageTask } from '@/api/messageTask'
import type { MessageTaskCreate } from '@/types/messageTask'
import CronExpressionPicker from '@/components/CronExpressionPicker'
import MpMultiSelect from '@/components/MpMultiSelect'
import ACodeEditor from '@/components/ACodeEditor'

const formSchema = z.object({
  name: z.string().min(2, '任务名称长度应在2-30个字符之间').max(30, '任务名称长度应在2-30个字符之间'),
  message_type: z.number().default(0),
  message_template: z.string().optional(),
  web_hook_url: z.string().optional(),
  mps_id: z.array(z.any()).optional(),
  status: z.number().default(1),
  cron_exp: z.string().min(1, '请输入cron表达式'),
})

const MessageTaskForm: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [showCronPicker, setShowCronPicker] = useState(false)
  const [showMpSelector, setShowMpSelector] = useState(false)
  const { toast } = useToast()
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      message_type: 0,
      message_template: '',
      web_hook_url: '',
      mps_id: [],
      status: 1,
      cron_exp: '',
    },
  })

  useEffect(() => {
    if (id) {
      setIsEditMode(true)
      fetchTaskDetail(id)
    }
  }, [id])

  const fetchTaskDetail = async (taskId: string) => {
    setLoading(true)
    try {
      const res = await getMessageTask(taskId)
      form.reset({
        name: res.name,
        message_type: res.message_type,
        message_template: res.message_template,
        web_hook_url: res.web_hook_url,
        mps_id: JSON.parse(res.mps_id || '[]'),
        status: res.status,
        cron_exp: res.cron_exp
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (values: z.infer<typeof formSchema>) => {
    setLoading(true)

    try {
      const submitData = {
        ...values,
        mps_id: JSON.stringify(values.mps_id || [])
      } as MessageTaskCreate

      if (isEditMode && id) {
        await updateMessageTask(id, submitData)
        toast({
          title: '成功',
          description: '更新任务成功，点击应用按钮后任务才会生效',
        })
      } else {
        await createMessageTask(submitData)
        toast({
          title: '成功',
          description: '创建任务成功，点击应用按钮后任务才会生效',
        })
      }
      setTimeout(() => {
        navigate('/message-tasks')
      }, 1500)
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: '错误',
        description: error?.errors?.join('\n') || '表单验证失败，请检查输入内容',
      })
    } finally {
      setLoading(false)
    }
  }

  const cronExp = form.watch('cron_exp')
  const messageType = form.watch('message_type')
  const mpsId = form.watch('mps_id') || []

  if (loading && !form.formState.isDirty) {
    return (
      <div className="p-5 max-w-[800px] mx-auto">
        <Skeleton className="h-8 w-48 mb-5" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-5 max-w-[800px] mx-auto">
      <h2 className="mb-5 text-foreground">{isEditMode ? '编辑消息任务' : '添加消息任务'}</h2>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>任务名称 <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Input placeholder="请输入任务名称" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="message_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>类型</FormLabel>
                <FormControl>
                  <RadioGroup
                    value={field.value?.toString()}
                    onValueChange={(value) => field.onChange(parseInt(value))}
                    type="button"
                  >
                    <Radio value="0" button>Message</Radio>
                    <Radio value="1" button>WebHook</Radio>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="message_template"
            render={({ field }) => (
              <FormItem>
                <FormLabel>消息模板</FormLabel>
                <FormControl>
                  <div>
                    <ACodeEditor
                      value={field.value || ''}
                      onChange={(value) => field.onChange(value)}
                      placeholder="请输入消息模板内容"
                      language="custom"
                    />
                    {messageType === 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-2"
                        onClick={() => form.setValue('message_template', '### {{feed.mp_name}} 订阅消息：\n{% if articles %}\n{% for article in articles %}\n- [**{{ article.title }}**]({{article.url}}) ({{ article.publish_time }})\n{% endfor %}\n{% else %}\n- 暂无文章\n{% endif %}')}
                      >
                        使用示例消息模板
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-2"
                        onClick={() => form.setValue('message_template', '{\n    \'articles\': [\n    {% for article in articles %}\n    {{article}}\n    {% if not loop.last %},{% endif %}\n    {% endfor %}\n    ]\n}')}
                      >
                        使用示例WebHook模板
                      </Button>
                    )}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="web_hook_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel>WebHook地址</FormLabel>
                <FormControl>
                  <div className="space-y-2">
                    <Input placeholder="请输入WebHook地址" {...field} />
                    <a
                      href="https://open.dingtalk.com/document/orgapp/obtain-the-webhook-address-of-a-custom-robot"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      如何获取WebHook
                    </a>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="cron_exp"
            render={({ field }) => (
              <FormItem>
                <FormLabel>cron表达式 <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <div className="flex gap-2">
                    <Input
                      value={cronExp || ''}
                      placeholder="请输入cron表达式"
                      readOnly
                      className="w-[300px]"
                    />
                    <Button type="button" onClick={() => setShowCronPicker(true)}>选择</Button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="mps_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>公众号</FormLabel>
                <FormControl>
                  <div className="flex gap-2">
                    <Input
                      value={mpsId.map((mp: any) => mp.id?.toString() || '').join(',')}
                      placeholder="请选择公众号，留空则对所有公众号生效"
                      readOnly
                      className="w-[300px]"
                    />
                    <Button type="button" onClick={() => setShowMpSelector(true)}>选择</Button>
                  </div>
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
                <FormControl>
                  <RadioGroup
                    value={field.value?.toString()}
                    onValueChange={(value) => field.onChange(parseInt(value))}
                    type="button"
                  >
                    <Radio value="1" button>启用</Radio>
                    <Radio value="0" button>禁用</Radio>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? '提交中...' : '提交'}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>取消</Button>
          </div>
        </form>
      </Form>

      <Dialog open={showCronPicker} onOpenChange={setShowCronPicker}>
        <DialogContent className="max-w-[800px]">
          <DialogHeader>
            <DialogTitle>选择cron表达式</DialogTitle>
          </DialogHeader>
          <CronExpressionPicker
            value={cronExp || ''}
            onChange={(value) => form.setValue('cron_exp', value)}
          />
          <DialogFooter>
            <Button onClick={() => setShowCronPicker(false)}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMpSelector} onOpenChange={setShowMpSelector}>
        <DialogContent className="max-w-[800px]">
          <DialogHeader>
            <DialogTitle>选择公众号</DialogTitle>
          </DialogHeader>
          <MpMultiSelect
            value={mpsId}
            onChange={(value) => form.setValue('mps_id', value)}
          />
          <DialogFooter>
            <Button onClick={() => setShowMpSelector(false)}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default MessageTaskForm
