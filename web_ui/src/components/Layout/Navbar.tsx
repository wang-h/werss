import React from 'react'
import { Link } from 'react-router-dom'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
} from '@/components/ui/sidebar'
import { FileText, Rss, Tag, Bell, Settings, Info, LayoutDashboard, GalleryVerticalEnd } from 'lucide-react'
import { NavMain } from '@/components/nav-main'

const Navbar: React.FC = () => {
  const logo = '/static/logo.svg'
  const appTitle = import.meta.env.VITE_APP_TITLE || '微信公众号订阅助手'

  const menuItems = [
    {
      title: '数据概览',
      url: '/dashboard',
      icon: LayoutDashboard,
    },
    {
      title: '文章列表',
      url: '/articles',
      icon: FileText,
    },
    {
      title: '订阅管理',
      url: '/subscriptions',
      icon: Rss,
    },
    {
      title: '导出记录',
      url: '/export/records',
      icon: FileText,
    },
    {
      title: '标签管理',
      url: '/tags',
      icon: Tag,
    },
    {
      title: '消息任务',
      url: '/message-tasks',
      icon: Bell,
    },
    {
      title: '配置信息',
      url: '/configs',
      icon: Settings,
    },
    {
      title: '系统信息',
      url: '/sys-info',
      icon: Info,
    }
  ]

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/" className="flex items-center gap-3">
                {logo ? (
                  <img 
                    src={logo} 
                    alt={appTitle} 
                    className="h-8 w-8 rounded-md object-contain flex-shrink-0" 
                  />
                ) : (
                  <div className="h-8 w-8 rounded-md bg-sidebar-primary flex items-center justify-center flex-shrink-0">
                    <GalleryVerticalEnd className="h-4 w-4 text-sidebar-primary-foreground" />
                  </div>
                )}
                <div className="flex flex-col gap-0.5 leading-none min-w-0">
                  <span className="font-semibold truncate">{appTitle}</span>
                  <span className="text-xs text-muted-foreground">v1.0.0</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={menuItems} />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}

export default Navbar
