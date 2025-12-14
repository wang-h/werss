import React, { useState, useEffect, useMemo, createContext, useContext } from 'react'
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { useToast } from '@/hooks/use-toast'
import Navbar from './Navbar'
import WechatAuthQrcode, { WechatAuthQrcodeRef } from '../WechatAuthQrcode'
import { getCurrentUser, logout } from '@/api/auth'
import { getSysInfo } from '@/api/sysInfo'
import { initBrowserNotification } from '@/utils/browserNotification'
import { translatePage, setCurrentLanguage } from '@/utils/translate'
import { getSettings, type AppSettings } from '@/utils/settings'
import { ModeToggle } from '@/components/mode-toggle'
import { User, Lock, QrCode, Settings, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AppContextType {
  showAuthQrcode: () => void
}

const AppContext = createContext<AppContextType | null>(null)

export const useAppContext = () => {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useAppContext must be used within BasicLayout')
  }
  return context
}

const BasicLayout: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [userInfo, setUserInfo] = useState({ username: '', avatar: '' })
  const [haswxLogined, setHaswxLogined] = useState(true)
  const [hasLogined, setHasLogined] = useState(false)
  const [currentLanguage, setCurrentLanguageState] = useState(
    localStorage.getItem('language') || 'chinese_simplified'
  )
  
  // 确保空字符串被正确处理（用于禁用翻译）
  useEffect(() => {
    const savedLanguage = localStorage.getItem('language')
    if (savedLanguage === '') {
      setCurrentLanguageState('')
    }
  }, [])
  const [settings, setSettings] = useState<AppSettings>(getSettings())
  const qrcodeRef = React.useRef<WechatAuthQrcodeRef>(null)
  const { toast } = useToast()

  const isAuthenticated = useMemo(() => {
    const token = localStorage.getItem('token')
    setHasLogined(!!token)
    return !!token
  }, [location.pathname])

  const appTitle = useMemo(
    () => import.meta.env.VITE_APP_TITLE || 'WeRSS 公众号订阅平台',
    []
  )
  const logo = '/static/logo.svg'

  const fetchUserInfo = async () => {
    try {
      const res = await getCurrentUser() as unknown as { username: string; avatar: string }
      setUserInfo(res)
    } catch (error) {
      console.error('获取用户信息失败', error)
    }
  }

  const fetchSysInfo = async () => {
    try {
      const res = await getSysInfo()
      setHaswxLogined(res?.wx?.login || false)
    } catch (error) {
      console.error('获取系统信息失败', error)
    }
  }

  const showAuthQrcode = () => {
    qrcodeRef.current?.startAuth()
  }

  const handleLanguageChange = (language: string) => {
    // 将 "__disabled__" 转换为空字符串以保持与现有逻辑的兼容性
    const actualLanguage = language === '__disabled__' ? '' : language
    setCurrentLanguageState(actualLanguage)
    setCurrentLanguage(actualLanguage)
  }

  const handleLogout = async () => {
    try {
      await logout()
      localStorage.removeItem('token')
      navigate('/login')
    } catch (error) {
      toast({
        variant: "destructive",
        title: "错误",
        description: "退出登录失败"
      })
    }
  }

  const goToEditUser = () => {
    navigate('/edit-user')
  }

  const goToChangePassword = () => {
    navigate('/change-password')
  }

  const goToSettings = () => {
    navigate('/settings')
  }

  useEffect(() => {
    if (isAuthenticated) {
      fetchUserInfo()
    }
    initBrowserNotification()
    translatePage()
    fetchSysInfo()
    
    // 监听设置变更
    const handleSettingsChange = (e: CustomEvent<AppSettings>) => {
      setSettings(e.detail)
    }
    
    window.addEventListener('settingsChanged', handleSettingsChange as EventListener)
    
    return () => {
      window.removeEventListener('settingsChanged', handleSettingsChange as EventListener)
    }
  }, [])

  useEffect(() => {
    setHasLogined(!!localStorage.getItem('token'))
    if (hasLogined) {
      fetchUserInfo()
    }
  }, [location.pathname])

  const languageOptions = [
    { value: '__disabled__', label: '禁用' },
    { value: 'chinese_simplified', label: '简体中文' },
    { value: 'chinese_traditional', label: '繁體中文' },
    { value: 'english', label: 'English' },
  ]

  // 路由名称映射
  const routeNameMap: Record<string, string> = {
    '/': '首页',
    '/dashboard': '数据概览',
    '/articles': '文章列表',
    '/subscriptions': '订阅管理',
    '/export/records': '导出记录',
    '/tags': '标签管理',
    '/message-tasks': '消息任务',
    '/configs': '配置信息',
    '/sys-info': '系统信息',
  }

  const getBreadcrumbItems = (): Array<{ label: string; path: string }> => {
    const pathSegments = location.pathname.split('/').filter(Boolean)
    const items: Array<{ label: string; path: string }> = []
    
    if (pathSegments.length === 0) {
      return [{ label: '首页', path: '/' }]
    }

    let currentPath = ''
    pathSegments.forEach((segment) => {
      currentPath += `/${segment}`
      const label = routeNameMap[currentPath] || segment
      items.push({ label, path: currentPath })
    })

    return items
  }

  const breadcrumbItems = getBreadcrumbItems()

  const layoutContent = location.pathname === '/login' ? (
    <div className="min-h-screen flex flex-col" id="main">
      <main className="flex-1 min-h-screen p-6">
        <Outlet />
      </main>
    </div>
  ) : (
    <SidebarProvider>
      <Navbar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-2 px-4 flex-1">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                {breadcrumbItems.map((item, index) => (
                  <React.Fragment key={item.path}>
                    {index > 0 && <BreadcrumbSeparator />}
                    <BreadcrumbItem className={index === breadcrumbItems.length - 1 ? '' : 'hidden md:block'}>
                      {index === breadcrumbItems.length - 1 ? (
                        <BreadcrumbPage>{item.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <Link to={item.path} className="text-muted-foreground hover:text-foreground">{item.label}</Link>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </React.Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          {hasLogined && (
            <div className="flex items-center gap-4 px-4">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={showAuthQrcode}
                      className={cn(
                        "cursor-pointer text-lg transition-colors",
                        !haswxLogined ? 'text-destructive hover:text-destructive/80' : 'text-foreground hover:text-foreground/70'
                      )}
                    >
                      <QrCode className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {!haswxLogined ? '未授权，请扫码登录' : '点我扫码授权'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <ModeToggle />
              <Select 
                value={currentLanguage || '__disabled__'} 
                onValueChange={handleLanguageChange}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languageOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <a 
                href="/api/docs" 
                target="_blank" 
                className="text-foreground hover:text-foreground/80 no-underline text-sm"
              >
                Docs
              </a>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center cursor-pointer gap-2">
                    <Avatar className="h-9 w-9 border-2 border-border">
                      {userInfo.avatar ? (
                        <AvatarImage src={userInfo.avatar} alt="avatar" />
                      ) : (
                        <AvatarFallback>
                          <User className="h-4 w-4" />
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <span className="text-foreground font-medium text-sm hidden md:inline">{userInfo.username}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={goToEditUser}>
                    <User className="h-4 w-4 mr-2" />
                    个人中心
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={goToChangePassword}>
                    <Lock className="h-4 w-4 mr-2" />
                    修改密码
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={goToSettings}>
                    <Settings className="h-4 w-4 mr-2" />
                    设置
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={showAuthQrcode}>
                    <QrCode className="h-4 w-4 mr-2" />
                    扫码授权
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <WechatAuthQrcode ref={qrcodeRef} />
            </div>
          )}
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0" id="main">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )

  // 水印功能暂时保留，等找到 shadcn/ui 的替代方案
  return (
    <AppContext.Provider value={{ showAuthQrcode }}>
      {settings.watermarkEnabled ? (
        <div 
          className="relative"
          style={{
            backgroundImage: `repeating-linear-gradient(
              -22deg,
              transparent,
              transparent 100px,
              rgba(0,0,0,0.03) 100px,
              rgba(0,0,0,0.03) 200px
            )`,
            backgroundSize: '200px 200px'
          }}
        >
          <div 
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `repeating-linear-gradient(
                22deg,
                transparent,
                transparent 50px,
                rgba(0,0,0,0.02) 50px,
                rgba(0,0,0,0.02) 100px
              )`
            }}
          />
          <div className="relative">
            {layoutContent}
          </div>
        </div>
      ) : (
        layoutContent
      )}
    </AppContext.Provider>
  )
}

export default BasicLayout
