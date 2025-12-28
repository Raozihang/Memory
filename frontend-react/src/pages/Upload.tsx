import { useState } from 'react';
import { api } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { generateVariants, extractExif } from '@/lib/image-utils';
import { Loader2, UploadCloud, Plus, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function UploadPage() {
  const queryClient = useQueryClient();
  const { data: albums = [] } = useQuery({ queryKey: ['albums'], queryFn: api.getAlbums });
  
  const [selectedAlbum, setSelectedAlbum] = useState<string>('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');

  const [newAlbumTitle, setNewAlbumTitle] = useState('');
  const [newAlbumDesc, setNewAlbumDesc] = useState('');
  const [creatingAlbum, setCreatingAlbum] = useState(false);

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
    } catch {
      setStatus('创建相册失败');
    } finally {
      setCreatingAlbum(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setStatus('');
    }
  };

  const handleUpload = async () => {
    if (!selectedAlbum) { setStatus('请选择一个相册'); return; }
    if (files.length === 0) { setStatus('请选择照片'); return; }

    setUploading(true);
    setProgress(0);

    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setStatus(`正在处理: ${f.name} (${i + 1}/${files.length})`);
        
        const originalDataUrl = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = (e) => resolve(e.target?.result as string);
          r.readAsDataURL(f);
        });

        const v = await generateVariants(f);
        const exif = await extractExif(f);
        
        let takenAt;
        const dtStr = exif.DateTimeOriginal || exif.DateTime;
        if (dtStr) {
          const a = dtStr.split(' ');
          const b = a[0].split(':');
          const dt = new Date(`${b[0]}-${b[1]}-${b[2]}T${a[1]}`);
          takenAt = dt.toISOString();
        } else if (f.lastModified) {
          takenAt = new Date(f.lastModified).toISOString();
        } else {
          takenAt = new Date().toISOString();
        }

        const body = {
          albumId: selectedAlbum,
          filename: f.name,
          dataUrl: originalDataUrl,
          displayDataUrl: v.display,
          mediumDataUrl: v.medium,
          thumbDataUrl: v.thumb,
          taken_at: takenAt,
          exif
        };

        await api.uploadPhoto(body);
        setProgress(((i + 1) / files.length) * 100);
      }
      setStatus('所有照片上传完成！');
      setFiles([]);
      // Optional: clear file input
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if(fileInput) fileInput.value = '';
      
      queryClient.invalidateQueries({ queryKey: ['photos'] });
      queryClient.invalidateQueries({ queryKey: ['albumsWithCovers'] });
      queryClient.invalidateQueries({ queryKey: ['albums'] });
    } catch (e) {
      console.error(e);
      setStatus('上传过程中发生错误');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold">上传照片</h1>

      <div className="mb-8 rounded-xl bg-card p-6 shadow-lg border border-border">
        <div className="mb-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">选择相册</label>
            <select 
              value={selectedAlbum} 
              onChange={(e) => setSelectedAlbum(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">-- 请选择相册 --</option>
              {albums.map(a => (
                <option key={a.id} value={a.id}>{a.title}</option>
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
                placeholder="简介 (可选)"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button 
                onClick={handleCreateAlbum}
                disabled={creatingAlbum || !newAlbumTitle}
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
              "flex h-40 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 transition-colors hover:bg-muted",
              uploading && "pointer-events-none opacity-50"
            )}
          >
            <div className="flex flex-col items-center justify-center pb-6 pt-5">
              <UploadCloud className="mb-4 h-10 w-10 text-muted-foreground" />
              <p className="mb-2 text-sm text-muted-foreground">
                <span className="font-semibold">点击上传</span> 或拖拽文件到此处
              </p>
              <p className="text-xs text-muted-foreground">支持 JPG, PNG, WebP</p>
            </div>
            <input id="file-upload" type="file" multiple accept="image/*" className="hidden" onChange={handleFileSelect} />
          </label>
        </div>

        {files.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-2 text-sm font-medium">已选择 {files.length} 个文件</h3>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
              {files.slice(0, 8).map((f, i) => (
                <div key={i} className="aspect-square overflow-hidden rounded-md bg-muted">
                   {/* Ideally we show preview, but creating ObjectURL for all might be heavy. Just show icon or simple div */}
                   <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground break-all p-1 text-center">
                     {f.name.slice(0, 10)}...
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

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {status && (
              <>
                {status.includes('完成') || status.includes('成功') ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : null}
                {status.includes('失败') || status.includes('错误') ? <XCircle className="h-4 w-4 text-red-500" /> : null}
                {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>{status}</span>
              </>
            )}
          </div>
          
          <button
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
