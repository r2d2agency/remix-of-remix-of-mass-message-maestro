import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Download, RefreshCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PWAUpdateBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState(0);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      // Check for updates every 60 seconds
      if (registration) {
        setInterval(() => {
          registration.update();
        }, 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('SW registration error:', error);
    },
  });

  const handleUpdate = async () => {
    setUpdating(true);
    setProgress(10);

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          return 90;
        }
        return prev + Math.random() * 15;
      });
    }, 300);

    const fallbackReload = setTimeout(() => {
      window.location.reload();
    }, 8000);

    try {
      await updateServiceWorker(true);
      setProgress(100);
    } catch (err) {
      console.error('Update failed:', err);
      setUpdating(false);
      setProgress(0);
    } finally {
      clearInterval(interval);
      clearTimeout(fallbackReload);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setNeedRefresh(false);
  };

  if (!needRefresh || dismissed || typeof document === 'undefined') return null;

  const bannerContent = (
    <div className="fixed inset-0 z-[2147483647] pointer-events-none">
      <div className={cn(
        "absolute bottom-4 left-4 right-4 mx-auto max-w-md pointer-events-auto",
        "bg-card border border-primary/30 rounded-xl shadow-2xl shadow-primary/10 p-4",
        "animate-in slide-in-from-bottom-4 duration-300 isolate"
      )}>
        {updating ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-5 w-5 text-primary animate-spin flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Atualizando sistema...</p>
                <p className="text-xs text-muted-foreground">Aguarde enquanto aplicamos as melhorias</p>
              </div>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">
              {progress < 50 ? 'Baixando atualização...' : progress < 90 ? 'Instalando...' : 'Finalizando...'}
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0">
              <Download className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Nova versão disponível!</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Atualize para ter acesso às últimas melhorias e correções.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <Button type="button" size="sm" className="h-8 text-xs gap-1.5" onClick={handleUpdate}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Atualizar agora
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={handleDismiss}>
                  Depois
                </Button>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              aria-label="Fechar aviso de atualização"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(bannerContent, document.body);
}
