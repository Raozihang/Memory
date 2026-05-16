import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, UploadCloud, Plus, CheckCircle2, XCircle, Lock, LogOut } from 'lucide-react';
import { api } from '@/lib/api';
import { generateVariants, extractExif } from '@/lib/image-utils';
import { cn } from '@/lib/utils';

type ApiError = Error & {
  status?: number;
};

function isUnauthorized(error: unknown) {
  return typeof error === 'object' && error !== null && (error as ApiError).status === 401;
}

export default function UploadPage() {
  const queryClient = useQueryClient();

  const [selectedAlbum, setSelectedAlbum] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');

  const [newAlbumTitle, setNewAlbumTitle] = useState('');
  const [newAlbumDesc, setNewAlbumDesc] = useState('');
  const [creatingAlbum, setCreatingAlbum] = useState(false);

  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [authError, setAuthError] = useState(false);

  const { data: albums = [] } = useQuery({
    queryKey: ['albums'],
    queryFn: api.getAlbums,
    enabled: isAuthenticated,
  });

  useEffect(() => {
    let active = true;

    api.getUploadSession()
      .then((session) => {
        if (!active) return;
        setIsAuthenticated(Boolean(session.authenticated));
      })
      .catch(() => {
        if (!active) return;
        setIsAuthenticated(false);
      })
      .finally(() => {
        if (!active) return;
        setAuthChecked(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const resetToLogin = (message = '登录状态已失效，请重新输入密码') => {
    setIsAuthenticated(false);
    setAuthenticating(false);
    setAuthError(false);
    setPassword('');
    setFiles([]);
    setUploading(false);
    setCreatingAlbum(false);
    setProgress(0);
    setStatus(message);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthenticating(true);
    setAuthError(false);

    try {
      await api.loginUpload(password);
      setIsAuthenticated(true);
      setPassword('');
      setStatus('');
      await queryClient.invalidateQueries({ queryKey: ['albums'] });
    } catch (error) {
      if (isUnauthorized(error)) {
        setAuthError(true);
      } else {
        setStatus('登录失败，请稍后重试');
      }
    } finally {
      setAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.logoutUpload();
    } catch {
      // Ignore logout network errors and clear local UI state regardless.
    } finally {
      resetToLogin('');
    }
  };

  const handleCreateAlbum = async () => {
    if (!newAlbumTitle.trim()) return;

    setCreatingAlbum(true);
    try {
      const res = await api.createAlbum(newAlbumTitle, newAlbumDesc);
      await queryClient.invalidateQueries({ queryKey: ['albums'] });
      setSelectedAlbum(res.id);
      setNewAlbumTitle('');
      setNewAlbumDesc('');
      setStatus('相册创建成功');
    } catch (error) {
      if (isUnauthorized(error)) {
        resetToLogin();
        return;
      }
      setStatus('创建相册失败');
    } finally {
      setCreatingAlbum(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setFiles(Array.from(e.target.files));
    setStatus('');
  };

  const handleUpload = async () => {
    if (!selectedAlbum) {
      setStatus('请选择一个相册');
      return;
    }
    if (files.length === 0) {
      setStatus('请选择照片');
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        setStatus(`正在处理: ${file.name} (${i + 1}/${files.length})`);

        const originalDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.readAsDataURL(file);
        });

        const variants = await generateVariants(file);
        const exif = await extractExif(file);

        let takenAt: string;
        const exifDate = exif.DateTimeOriginal || exif.DateTime;
        if (exifDate) {
          const [datePart, timePart] = exifDate.split(' ');
          const [year, month, day] = datePart.split(':');
          takenAt = new Date(`${year}-${month}-${day}T${timePart}`).toISOString();
        } else if (file.lastModified) {
          takenAt = new Date(file.lastModified).toISOString();
        } else {
          takenAt = new Date().toISOString();
        }

        await api.uploadPhoto({
          albumId: selectedAlbum,
          filename: file.name,
          dataUrl: originalDataUrl,
          displayDataUrl: variants.display,
          mediumDataUrl: variants.medium,
          thumbDataUrl: variants.thumb,
          taken_at: takenAt,
          exif,
        });

        setProgress(((i + 1) / files.length) * 100);
      }

      setStatus('所有照片上传完成');
      setFiles([]);
      const fileInput = document.getElementById('file-upload') as HTMLInputElement | null;
      if (fileInput) fileInput.value = '';
      await queryClient.invalidateQueries({ queryKey: ['photos'] });
    } catch (error) {
      if (isUnauthorized(error)) {
        resetToLogin();
        return;
      }
      console.error(error);
      setStatus('上传出错，请重试');
    } finally {
      setUploading(false);
    }
  };

  if (!authChecked) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-4 py-2 text-sm text-muted-foreground shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在检查登录状态
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6 rounded-2xl border border-border/60 bg-card p-8 shadow-lg">
          <div className="flex flex-col items-center space-y-2 text-center">
            <div className="rounded-full bg-secondary p-3">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">访问受限</h1>
            <p className="text-sm text-muted-foreground">请输入密码后继续上传照片</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setAuthError(false);
                }}
                placeholder="请输入访问密码"
                className={cn(
                  'flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                  authError ? 'border-red-500 focus-visible:ring-red-500' : 'border-input',
                )}
                disabled={authenticating}
              />
              {authError && <p className="text-xs text-red-500">密码错误，请重试</p>}
              {!authError && status && <p className="text-xs text-muted-foreground">{status}</p>}
            </div>
            <button
              type="submit"
              disabled={authenticating || !password.trim()}
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              {authenticating ? <Loader2 className="h-4 w-4 animate-spin" /> : '验证'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">上传照片</h1>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-lg">
        <div className="mb-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">选择相册</label>
            <select
              value={selectedAlbum}
              onChange={(e) => setSelectedAlbum(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">-- 请选择相册 --</option>
              {albums.map((album) => (
                <option key={album.id} value={album.id}>
                  {album.title}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-lg border border-dashed border-border p-4">
            <p className="mb-2 text-sm font-medium text-muted-foreground">或者创建新相册</p>
            <div className="flex gap-2">
              <input
                value={newAlbumTitle}
                onChange={(e) => setNewAlbumTitle(e.target.value)}
                placeholder="新相册名称"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                value={newAlbumDesc}
                onChange={(e) => setNewAlbumDesc(e.target.value)}
                placeholder="简介（可选）"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={handleCreateAlbum}
                disabled={creatingAlbum || !newAlbumTitle.trim()}
                className="inline-flex items-center justify-center rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
              >
                {creatingAlbum ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                创建
              </button>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <label
            htmlFor="file-upload"
            className={cn(
              'flex h-40 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 transition-colors hover:bg-muted',
              uploading && 'pointer-events-none opacity-50',
            )}
          >
            <div className="flex flex-col items-center justify-center pb-6 pt-5">
              <UploadCloud className="mb-4 h-10 w-10 text-muted-foreground" />
              <p className="mb-2 text-sm text-muted-foreground">
                <span className="font-semibold">点击上传</span>
                {' '}或拖拽文件到此处
              </p>
              <p className="text-xs text-muted-foreground">支持 JPG、PNG、WebP</p>
            </div>
            <input id="file-upload" type="file" multiple accept="image/*" className="hidden" onChange={handleFileSelect} />
          </label>
        </div>

        {files.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-2 text-sm font-medium">已选择 {files.length} 个文件</h3>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
              {files.slice(0, 8).map((file, index) => (
                <div key={`${file.name}-${index}`} className="aspect-square overflow-hidden rounded-md bg-muted">
                  <div className="flex h-full w-full items-center justify-center break-all p-1 text-center text-xs text-muted-foreground">
                    {file.name.slice(0, 10)}...
                  </div>
                </div>
              ))}
              {files.length > 8 && (
                <div className="flex aspect-square items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                  +{files.length - 8}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <div className="flex min-h-5 items-center gap-2 text-sm text-muted-foreground">
            {status && (
              <>
                {(status.includes('完成') || status.includes('成功')) && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                {(status.includes('失败') || status.includes('错误')) && <XCircle className="h-4 w-4 text-red-500" />}
                {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>{status}</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || files.length === 0}
            className="inline-flex items-center justify-center rounded-md bg-primary px-8 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {uploading ? `上传中 ${Math.round(progress)}%` : '开始上传'}
          </button>
        </div>

        {uploading && (
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
