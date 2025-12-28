import { Link } from 'react-router-dom';

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl py-10">
      <h1 className="mb-4 text-3xl font-bold tracking-tight">联系我们</h1>
      <p className="mb-4 text-muted-foreground leading-relaxed">
        如有关于网站 BUG 反馈、希望新增功能、下架侵权照片或其它问题的反馈，欢迎与我们联系。
      </p>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 mb-8">
        <div className="rounded-2xl border border-border/60 bg-secondary/40 p-6">
          <h2 className="mb-3 text-lg font-semibold">邮件联系</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            你可以直接发送邮件至
            <a
              href="mailto:rzh@rzh.email"
              className="mx-1 underline underline-offset-2 text-primary hover:text-primary/80"
            >
              rzh@rzh.email
            </a>
            ，我们会尽快查看并回复。
          </p>
        </div>

        <div className="rounded-2xl border border-border/60 bg-secondary/40 p-6">
          <h2 className="mb-3 text-lg font-semibold">微信联系</h2>
          <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
            你也可以通过微信联系我们，备注来意。
          </p>
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="overflow-hidden rounded-xl border border-border bg-background/80 p-2 shadow-sm">
              <img
                src="https://youke2.picui.cn/s1/2025/12/12/693c0b219dd14.png"
                alt="微信联系二维码"
                className="h-52 w-52 max-w-full object-contain"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              长按保存二维码，或使用微信扫一扫添加
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4">
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
