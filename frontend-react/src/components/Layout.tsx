import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Home, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLayout } from '@/lib/LayoutContext';
import { BottomCapsuleDateTimeline } from '@/components/DraggableDateTimeline';
import { InternalLink } from '@/components/InternalLink';

export function Layout() {
  const location = useLocation();
  const { isViewerOpen, isImmersive, timelineCapsule } = useLayout();
  const currentYear = new Date().getFullYear();
  const copyrightYears = currentYear > 2025 ? `2025-${currentYear}` : '2025';

  const hideMobileCapsule = isViewerOpen || (isImmersive && location.pathname !== '/timeline');
  const showMobileCapsule = !hideMobileCapsule;

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
          <InternalLink to="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <span className="bg-gradient-to-b from-zinc-50 via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              记忆回廊
            </span>
          </InternalLink>
          
          <nav className="hidden md:flex items-center gap-4">
            {navItems.map((item) => (
              <InternalLink
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
              </InternalLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="container pt-16 sm:pt-20 px-3 sm:px-4 pb-24 md:pb-8 w-full max-w-full box-border">
        <Outlet />
      </main>
      
      <AnimatePresence initial={false}>
        {showMobileCapsule ? (
          <motion.div
            key="mobile-capsule"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
            className="layout-nav md:hidden fixed left-0 right-0 bottom-8 z-40 px-3"
          >
            <div className="w-full flex justify-center">
              <motion.div
                layout
                transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
                className="relative inline-flex items-center gap-2 max-w-[92vw] rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl ring-1 ring-white/5 px-2.5 py-2"
              >
                <InternalLink
                  to="/"
                  className={cn(
                    "flex items-center justify-center h-10 w-10 rounded-full transition-colors",
                    location.pathname === '/' 
                      ? "bg-white/10 text-foreground shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)]" 
                      : "text-white/70 hover:text-white hover:bg-white/5"
                  )}
                  aria-label="首页"
                >
                  <Home className={cn("h-5 w-5", location.pathname === '/' && "stroke-[2.5px]")} />
                </InternalLink>

                <AnimatePresence mode="wait" initial={false}>
                  {location.pathname === '/timeline' && timelineCapsule ? (
                    <motion.div
                      key="timeline-date"
                      layout
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                      className="relative"
                    >
                      <BottomCapsuleDateTimeline
                        embedded
                        onDateSelect={timelineCapsule.onDateSelect}
                        availableDates={timelineCapsule.availableDates}
                        initialDate={timelineCapsule.initialDate}
                        value={timelineCapsule.value}
                        mode={timelineCapsule.mode}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="timeline-link"
                      layout
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                    >
                      <InternalLink
                        to="/timeline"
                        className={cn(
                          "flex items-center justify-center h-10 w-10 rounded-full transition-colors",
                          location.pathname === '/timeline' 
                            ? "bg-white/10 text-foreground shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)]" 
                            : "text-white/70 hover:text-white hover:bg-white/5"
                        )}
                        aria-label="时间轴"
                      >
                        <Calendar className={cn("h-5 w-5", location.pathname === '/timeline' && "stroke-[2.5px]")} />
                      </InternalLink>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <footer className="py-8 text-center text-sm text-muted-foreground pb-32 md:pb-8">
        <p>
          © {copyrightYears} @WilliamRao. All rights reserved. ·{' '}
          <InternalLink
            to="/contact"
            className="underline underline-offset-2 hover:text-foreground"
          >
            联系我们
          </InternalLink>
        </p>
      </footer>
    </div>
  );
}
