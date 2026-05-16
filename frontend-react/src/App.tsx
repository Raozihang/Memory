import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { Layout } from './components/Layout';
import { LayoutProvider } from './lib/LayoutContext';
import { WelcomeModal } from './components/WelcomeModal';

const Home = lazy(() => import('./pages/Home'));
const AlbumPage = lazy(() => import('./pages/Album'));
const Timeline = lazy(() => import('./pages/Timeline'));
const UploadPage = lazy(() => import('./pages/Upload'));
const DonatePage = lazy(() => import('./pages/Donate'));
const ContactPage = lazy(() => import('./pages/Contact'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 20,
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <LayoutProvider>
        <WelcomeModal />
      <BrowserRouter>
        <Suspense fallback={<div className="py-20 text-center text-muted-foreground">Loading...</div>}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/timeline" element={<Timeline />} />
              <Route path="/album/:id" element={<AlbumPage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/donate" element={<DonatePage />} />
              <Route path="/contact" element={<ContactPage />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
        </LayoutProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
