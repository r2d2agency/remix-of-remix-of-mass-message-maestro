import { useState, useCallback } from 'react';
import { API_URL, getAuthToken } from '@/lib/api';

interface UploadResult {
  success: boolean;
  file: {
    filename: string;
    originalName: string;
    mimetype: string;
    size: number;
    url: string;
  };
}

export function useUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const doUpload = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);

      const token = getAuthToken();
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setProgress(percentComplete);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result: UploadResult = JSON.parse(xhr.responseText);
            setProgress(100);
            resolve(result.file.url);
          } catch (e) {
            reject(new Error('Erro ao processar resposta'));
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.error || 'Erro ao fazer upload'));
          } catch {
            reject(new Error(`Erro ao fazer upload (${xhr.status})`));
          }
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Erro de conexão'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload cancelado'));
      });

      const uploadUrl = `${API_URL}/api/uploads`;
      xhr.open('POST', uploadUrl);
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      xhr.send(formData);
    });
  }, []);

  const uploadFile = useCallback(async (file: File, maxRetries = 2): Promise<string | null> => {
    setIsUploading(true);
    setProgress(0);

    console.log('[useUpload] Starting upload:', { name: file.name, type: file.type, size: file.size });

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[useUpload] Retry attempt ${attempt}/${maxRetries}`);
          setProgress(0);
          await new Promise(r => setTimeout(r, 500 * attempt));
        }
        const url = await doUpload(file);
        console.log('[useUpload] Success, URL:', url);
        setIsUploading(false);
        return url;
      } catch (err) {
        console.error(`[useUpload] Attempt ${attempt} failed:`, err);
        if (attempt === maxRetries) {
          setIsUploading(false);
          setProgress(0);
          throw err;
        }
      }
    }

    setIsUploading(false);
    setProgress(0);
    return null;
  }, [doUpload]);

  const resetProgress = useCallback(() => {
    setProgress(0);
  }, []);

  return {
    uploadFile,
    isUploading,
    progress,
    resetProgress,
  };
}
