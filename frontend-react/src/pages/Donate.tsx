import { Link } from 'react-router-dom';
import type { MouseEvent } from 'react';

export default function DonatePage() {
  const wechatRemark = '#付款:饶zi(RZH_rao)/捐赠/002';

  const handleWeChatLinkClick = async (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(wechatRemark);
      }
    } catch {}
    try {
      window.location.href = 'weixin://';
    } catch {}
  };

  return (
    <div className="mx-auto max-w-3xl py-10">
      <h1 className="mb-4 text-3xl font-bold tracking-tight">捐赠</h1>
      <p className="mb-6 text-muted-foreground leading-relaxed">
        感谢您对嘉祥记忆回廊的支持。您的捐赠将只用于网站运维、服务器资源购置以及后续功能迭代，
        帮助我们更好地保存与展示校园的珍贵记忆。
      </p>

      <div className="mb-8 rounded-2xl border border-border/60 bg-secondary/40 p-6">
        <h2 className="mb-3 text-xl font-semibold">捐赠方式</h2>
        <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
          目前仅支持通过微信进行捐赠。
        </p>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center">
          <div>
            <h3 className="mb-2 text-sm font-medium">微信捐赠</h3>
            <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
              请使用微信扫
              <span className="md:hidden">下方</span>
              <span className="hidden md:inline">右侧</span>
              二维码完成转账，或者点击二维码下方链接。
            </p>
          </div>
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="overflow-hidden rounded-xl border border-border bg-background/80 p-2 shadow-sm">
              <img
                src="https://youke2.picui.cn/s1/2025/12/12/693c073929bc7.jpg"
                alt="微信捐赠二维码"
                width={208}
                height={208}
                loading="lazy"
                className="h-52 w-52 max-w-full object-contain"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">长按保存二维码，或使用微信扫一扫</p>
            <a
              href="weixin://"
              onClick={handleWeChatLinkClick}
              className="text-[11px] text-primary underline underline-offset-2 break-all"
            >
              #付款:饶zi(RZH_rao)/捐赠/002
            </a>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          如需了解更多信息，可
          <Link
            to="/contact"
            className="ml-1 underline underline-offset-2 text-primary hover:text-primary/80"
          >
            联系我们
          </Link>
          。
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
