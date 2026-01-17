import { useState, useEffect, useCallback } from 'react';
import { API_URL, getAuthToken } from '@/lib/api';

export interface BrandingSettings {
  logo_login: string | null;
  logo_sidebar: string | null;
  favicon: string | null;
}

export function useBranding() {
  const [branding, setBranding] = useState<BrandingSettings>({
    logo_login: null,
    logo_sidebar: null,
    favicon: null,
  });
  const [loading, setLoading] = useState(true);

  const fetchBranding = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/branding`);
      if (response.ok) {
        const data = await response.json();
        setBranding(data);
        
        // Apply favicon if set
        if (data.favicon) {
          const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
          if (link) {
            link.href = data.favicon;
          }
        }
      }
    } catch (error) {
      console.error('Error fetching branding:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  return { branding, loading, refetch: fetchBranding };
}

export function useAdminSettings() {
  const [settings, setSettings] = useState<Array<{
    id: string;
    key: string;
    value: string | null;
    description: string | null;
  }>>([]);
  const [loading, setLoading] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/api/admin/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSetting = useCallback(async (key: string, value: string | null) => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/api/admin/settings/${key}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ value }),
      });
      
      if (response.ok) {
        const updated = await response.json();
        setSettings(prev => 
          prev.map(s => s.key === key ? updated : s)
        );
        return updated;
      }
      throw new Error('Failed to update setting');
    } catch (error) {
      console.error('Error updating setting:', error);
      throw error;
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return { settings, loading, updateSetting, refetch: fetchSettings };
}
