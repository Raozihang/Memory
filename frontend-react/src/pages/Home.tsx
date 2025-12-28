import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Coffee } from 'lucide-react';
import { api } from '@/lib/api';
import { AlbumCard } from '@/components/AlbumCard';

export default function Home() {
  const { data: albums = [], isLoading: albumsLoading } = useQuery({ queryKey: ['albumsWithCovers'], queryFn: api.getAlbumsWithCovers });

  return (
    <>
      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="mb-12 mt-20 text-center">
          <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl">
            <span className="bg-gradient-to-b from-zinc-50 via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              Memory
            </span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            每一张照片都记录着我们的美好时光，让这些珍贵的瞬间永远留存
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {albumsLoading ? (
            // Skeleton loading state to prevent CLS
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="group relative block overflow-hidden rounded-2xl bg-card">
                <div className="aspect-[4/3] w-full animate-pulse bg-muted" />
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <div className="h-6 w-2/3 animate-pulse rounded bg-white/20" />
                  <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-white/20" />
                </div>
              </div>
            ))
          ) : (
            albums.map(album => {
              return <AlbumCard key={album.id} album={album} coverPhoto={album.cover_photo || undefined} />;
            })
          )}
        </div>

        <div className="mt-24 mb-12 rounded-2xl bg-secondary/30 p-8 backdrop-blur-sm border border-border/50 text-center">
          <h2 className="text-2xl font-bold mb-6 tracking-tight">关于我们</h2>
          <p className="max-w-3xl mx-auto text-muted-foreground leading-relaxed mb-4">
            本网站由高2024级年级学生会制作，用于存档校园相关的珍贵照片，方便同学与老师回顾与共享。
          </p>
          <p className="max-w-3xl mx-auto text-muted-foreground leading-relaxed">
            我们以统一的相册形式进行保存与呈现，确保资料长期、稳定与易于检索，让这些值得纪念的瞬间被妥善留存。
          </p>
          <div className="mt-8">
            <Link 
              to="/donate"
              className="inline-flex items-center justify-center rounded-full bg-secondary/30 px-8 py-3 text-sm font-medium text-white shadow transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <Coffee className="mr-2 h-4 w-4" />
              捐赠
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
