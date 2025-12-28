import { useState, useEffect } from 'react';

export function WelcomeModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const hasSeenWelcome = sessionStorage.getItem('hasSeenWelcome');
    if (!hasSeenWelcome) {
      setIsOpen(true);
    }
  }, []);

  const handleConfirm = () => {
    sessionStorage.setItem('hasSeenWelcome', 'true');
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="rounded-2xl bg-secondary/30 backdrop-blur-sm border border-border/50 max-w-md w-full p-8 text-center">
        {/* Logo区域 */}
        <div className="mb-6">
          <img 
            src="https://youke2.picui.cn/s1/2025/12/12/693c022f2f19e.png" 
            alt="Logo" 
            className="h-16 mx-auto"
          />
        </div>

        {/* 主标题 */}
        <h2 className="text-2xl font-bold text-white mb-6">
          温馨提醒
        </h2>

        {/* 内容区域 */}
        <div className="text-gray-300 text-sm leading-relaxed mb-6 text-left">
          <p className="indent-8">
            校园生活的点滴碎片，都值得被妥帖珍藏。高2024级学生会特此开发此相册网站，为您留存青春里的每一份美好瞬间。在此我们也提醒您：请勿恶意编辑师生照片；也请务必在征得本人同意后，再分享这些珍贵的影像。愿这个小小的线上空间，能成为你回望高中时光的温暖港湾，让每一段回忆都澄澈而珍贵。
          </p>
        </div>

        {/* 按钮区域 */}
        <div className="space-y-3">
          <button
            onClick={handleConfirm}
            className="w-full py-3 px-6 border-2 border-amber-500 bg-transparent hover:bg-amber-500/10 text-white font-medium rounded transition-colors duration-200"
          >
            <span className="block">我已知晓</span>
            <span className="block">Ready to go back to the memories!</span>
          </button>
        </div>
      </div>
    </div>
  );
}
