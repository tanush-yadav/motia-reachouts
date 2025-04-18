'use client'

import {
  Briefcase,
  FileText,
  Home,
  LucideIcon,
  Mail,
  Settings
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { buttonVariants } from './ui/button'

interface SidebarLinkProps {
  href: string
  icon: LucideIcon
  label: string
  active: boolean
}

function SidebarLink({ href, icon: Icon, label, active }: SidebarLinkProps) {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <Link
          href={href}
          className={cn(
            buttonVariants({ variant: active ? 'default' : 'ghost', size: 'icon' }),
            'h-9 w-9'
          )}
        >
          <Icon className="h-4 w-4" />
          <span className="sr-only">{label}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-4">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function Sidebar() {
  const pathname = usePathname()

  const links = [
    {
      href: '/',
      icon: Home,
      label: 'Dashboard'
    },
    {
      href: '/leads',
      icon: Briefcase,
      label: 'Leads'
    },
    {
      href: '/emails',
      icon: Mail,
      label: 'Emails'
    },
    {
      href: '/templates',
      icon: FileText,
      label: 'Templates'
    },
    {
      href: '/settings',
      icon: Settings,
      label: 'Settings'
    }
  ]

  return (
    <div className="flex h-full w-14 flex-col items-center border-r py-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary-foreground mb-8">
        <span className="font-bold text-xl text-primary">AR</span>
      </div>

      <nav className="flex flex-col items-center space-y-4">
        {links.map((link) => (
          <SidebarLink
            key={link.href}
            href={link.href}
            icon={link.icon}
            label={link.label}
            active={pathname === link.href}
          />
        ))}
      </nav>
    </div>
  )
}