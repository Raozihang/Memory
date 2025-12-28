import { Link, Outlet, useLocation } from 'react-router-dom';
import { Home, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLayout } from '@/lib/LayoutContext';

export function Layout() {
  const location = useLocation();
  const { isViewerOpen, isImmersive } = useLayout();

  // 隐藏导航：查看原图时或沉浸模式时
  const hideNav = isViewerOpen || isImmersive;

  const navItems = [
    { href: '/', icon: Home, label: '首页' },
    { href: '/timeline', icon: Calendar, label: '时间轴' },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30 w-full max-w-full overflow-x-hidden">
      <header className={cn(
        "layout-header fixed top-0 left-0 right-0 z-40 border-b border-white/5 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 transition-transform duration-300",
        isImmersive && "-translate-y-full"
      )}>
        <div className="container flex h-14 sm:h-16 items-center justify-between px-3 sm:px-4">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <span className="bg-gradient-to-b from-zinc-50 via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              记忆回廊
            </span>
          </Link>
          
          <nav className="hidden md:flex items-center gap-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors hover:bg-white/10",
                  location.pathname === item.href 
                    ? "bg-white/10 text-foreground" 
                    : "text-muted-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="container pt-16 sm:pt-20 px-3 sm:px-4 pb-24 md:pb-8 w-full max-w-full box-border">
        <Outlet />
      </main>
      
      <nav className={cn(
        "layout-nav md:hidden fixed bottom-8 left-1/2 -translate-x-1/2 z-40 transition-all duration-300",
        hideNav && "translate-y-24 opacity-0 pointer-events-none"
      )}>
        <div className="flex items-center gap-2 p-2 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl ring-1 ring-white/5">
          {navItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "relative flex items-center justify-center px-6 py-3 rounded-full transition-all duration-300",
                location.pathname === item.href 
                  ? "bg-white/10 text-foreground shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)]" 
                  : "text-muted-foreground/60 hover:text-foreground hover:bg-white/5"
              )}
            >
              <item.icon className={cn("h-5 w-5", location.pathname === item.href && "stroke-[2.5px]")} />
              <span className="sr-only">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      <footer className="py-8 text-center text-sm text-muted-foreground pb-32 md:pb-8">
        <p>
          © 2025 @WilliamRao. All rights reserved. ·{' '}
          <Link
            to="/contact"
            className="underline underline-offset-2 hover:text-foreground"
          >
            联系我们
          </Link>
        </p>
      </footer>
    </div>
  );
}
