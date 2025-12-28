import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { LayoutProvider } from './lib/LayoutContext';
import { WelcomeModal } from './components/WelcomeModal';
import Home from './pages/Home';
import AlbumPage from './pages/Album';
import Timeline from './pages/Timeline';
import UploadPage from './pages/Upload';
import DonatePage from './pages/Donate';
import ContactPage from './pages/Contact';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1
    }
  }
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LayoutProvider>
      <WelcomeModal />
      <BrowserRouter>
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
      </BrowserRouter>
      </LayoutProvider>
    </QueryClientProvider>
  );
}

export default App;
