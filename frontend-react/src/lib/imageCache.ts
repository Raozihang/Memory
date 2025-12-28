/**
 * 图片缓存管理
 * 追踪哪些图片已经加载过高清版本，供瀑布流组件复用
 * 支持后台预加载高清图，加速 PhotoViewer 打开速度
 */

type ImageQuality = 'thumb' | 'medium' | 'display' | 'original';

// 记录每张图片已加载的最高质量级别
const loadedQualityMap = new Map<string, ImageQuality>();

// 质量级别优先级（数字越大质量越高）
const qualityPriority: Record<ImageQuality, number> = {
  thumb: 0,
  medium: 1,
  display: 2,
  original: 3,
};

// 订阅者列表
type Listener = (photoId: string, quality: ImageQuality) => void;
const listeners = new Set<Listener>();

// 后台预加载队列
const preloadQueue: Array<{ photoId: string; url: string }> = [];
let isPreloading = false;
// 正在预加载的图片 ID，避免重复加入队列
const pendingPreload = new Set<string>();

// 后台预加载处理函数
function processPreloadQueue() {
  if (isPreloading || preloadQueue.length === 0) return;
  
  isPreloading = true;
  const { photoId, url } = preloadQueue.shift()!;
  pendingPreload.delete(photoId);
  
  const img = new Image();
  img.onload = () => {
    // 预加载成功，标记为已加载 display
    imageCache.markLoaded(photoId, 'display');
    isPreloading = false;
    // 延迟处理下一个，避免占用太多带宽
    setTimeout(processPreloadQueue, 100);
  };
  img.onerror = () => {
    isPreloading = false;
    // 失败了也继续处理下一个
    setTimeout(processPreloadQueue, 100);
  };
  img.src = url;
}

export const imageCache = {
  /**
   * 标记图片已加载某个质量级别
   */
  markLoaded(photoId: string, quality: ImageQuality) {
    const current = loadedQualityMap.get(photoId);
    // 只有当新质量更高时才更新
    if (!current || qualityPriority[quality] > qualityPriority[current]) {
      loadedQualityMap.set(photoId, quality);
      // 通知订阅者
      listeners.forEach(listener => listener(photoId, quality));
    }
  },

  /**
   * 获取图片已加载的最高质量级别
   */
  getLoadedQuality(photoId: string): ImageQuality | null {
    return loadedQualityMap.get(photoId) || null;
  },

  /**
   * 检查图片是否已加载过高清版本（display 或 original）
   */
  hasHighQuality(photoId: string): boolean {
    const quality = loadedQualityMap.get(photoId);
    return quality === 'display' || quality === 'original';
  },

  /**
   * 订阅缓存更新
   */
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /**
   * 获取所有已加载高清图的 photoId 列表
   */
  getHighQualityIds(): string[] {
    const ids: string[] = [];
    loadedQualityMap.forEach((quality, id) => {
      if (quality === 'display' || quality === 'original') {
        ids.push(id);
      }
    });
    return ids;
  },

  /**
   * 将图片加入后台预加载队列
   * @param photoId 图片 ID
   * @param displayUrl display 质量的 URL
   */
  queuePreload(photoId: string, displayUrl: string) {
    // 如果已经加载过高清图，或者已在队列中，跳过
    if (imageCache.hasHighQuality(photoId) || pendingPreload.has(photoId)) {
      return;
    }
    pendingPreload.add(photoId);
    preloadQueue.push({ photoId, url: displayUrl });
    // 启动预加载处理
    processPreloadQueue();
  },

  /**
   * 优先预加载指定图片（插入队列头部）
   * 用于即将查看的图片
   */
  priorityPreload(photoId: string, displayUrl: string) {
    if (imageCache.hasHighQuality(photoId)) return;
    
    // 如果已在队列中，移到头部
    const existingIndex = preloadQueue.findIndex(item => item.photoId === photoId);
    if (existingIndex > 0) {
      const [item] = preloadQueue.splice(existingIndex, 1);
      preloadQueue.unshift(item);
    } else if (!pendingPreload.has(photoId)) {
      pendingPreload.add(photoId);
      preloadQueue.unshift({ photoId, url: displayUrl });
    }
    processPreloadQueue();
  },

  /**
   * 获取预加载队列长度（调试用）
   */
  getQueueLength(): number {
    return preloadQueue.length;
  },
};
