export const ADMIN_NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', labelAr: 'لوحة التحكم', icon: 'LayoutDashboard', exact: true },
  { href: '/admin/workshop', label: 'Workshop', labelAr: 'ورشة التأكد', icon: 'ClipboardCheck' },
  { href: '/admin/orders', label: 'Orders', labelAr: 'الطلبات', icon: 'ShoppingBag' },
  { href: '/admin/invitations', label: 'Invitations', labelAr: 'تشغيل الدعوات', icon: 'Send' },
  { href: '/admin/templates/list', label: 'Templates', labelAr: 'القوالب', icon: 'Layers' },
  { href: '/admin/templates', label: 'Uploads', labelAr: 'رفع التصاميم', icon: 'Upload' },
  { href: '/admin/home-assets', label: 'Homepage Assets', labelAr: 'أصول الصفحة الرئيسية', icon: 'ImagePlus' },
  { href: '/admin/users', label: 'Users', labelAr: 'المستخدمون', icon: 'Users' },
  { href: '/admin/analytics', label: 'Analytics', labelAr: 'التحليلات', icon: 'BarChart3' },
  { href: '/admin/revenue', label: 'Revenue', labelAr: 'الإيرادات', icon: 'Wallet' },
  { href: '/admin/notifications', label: 'Notifications', labelAr: 'التنبيهات', icon: 'Bell' },
  { href: '/admin/ai-assistant', label: 'AI Assistant', labelAr: 'المساعد الذكي', icon: 'Sparkles' },
  { href: '/admin/settings', label: 'Settings', labelAr: 'الإعدادات', icon: 'Settings' },
] as const

export type AdminNavItem = (typeof ADMIN_NAV_ITEMS)[number]
