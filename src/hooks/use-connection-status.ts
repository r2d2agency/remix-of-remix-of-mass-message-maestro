import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';

export interface ConnectionStatus {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'connecting';
  phoneNumber?: string | null;
  provider?: 'evolution' | 'wapi';
  error?: string | null;
}

interface UseConnectionStatusOptions {
  /** Interval in seconds between status checks (default: 30) */
  intervalSeconds?: number;
  /** Whether to start monitoring immediately (default: true) */
  autoStart?: boolean;
}

export function useConnectionStatus(options: UseConnectionStatusOptions = {}) {
  const { intervalSeconds = 30, autoStart = true } = options;
  
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMounted = useRef(true);
  const isCheckingRef = useRef(false);

  // Fetch all connections and their current status from the backend
  const fetchConnections = useCallback(async () => {
    try {
      const data = await api<Array<{
        id: string;
        name: string;
        status: string;
        phone_number?: string | null;
        provider?: 'evolution' | 'wapi';
      }>>('/api/connections');
      
      if (!isMounted.current) return;
      
      setConnections(data.map(c => ({
        id: c.id,
        name: c.name,
        status: c.status as 'connected' | 'disconnected' | 'connecting',
        phoneNumber: c.phone_number,
        provider: c.provider,
      })));
      
      return data;
    } catch (error) {
      console.error('Error fetching connections:', error);
      return [];
    }
  }, []);

  // Check status for a single connection and update it in the backend
  const checkConnectionStatus = useCallback(async (connectionId: string): Promise<ConnectionStatus | null> => {
    try {
      const result = await api<{
        status: string;
        phoneNumber?: string | null;
        provider?: string;
        error?: string | null;
      }>(`/api/evolution/${connectionId}/status`);
      
      return {
        id: connectionId,
        name: '',
        status: result.status as 'connected' | 'disconnected' | 'connecting',
        phoneNumber: result.phoneNumber,
        provider: result.provider as 'evolution' | 'wapi',
        error: result.error,
      };
    } catch (error) {
      console.error(`Error checking status for ${connectionId}:`, error);
      return null;
    }
  }, []);

  // Check all connections and update their statuses
  const checkAllConnections = useCallback(async () => {
    // Prevent overlapping checks (avoids rapid loops / multiple intervals)
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;
    setIsLoading(true);

    try {
      // First get all connections
      const conns = await fetchConnections();
      if (!conns || conns.length === 0 || !isMounted.current) {
        return;
      }

      // Check status for each connection in parallel
      const updatedConnections = await Promise.all(
        conns.map(async (conn) => {
          const status = await checkConnectionStatus(conn.id);
          return {
            ...conn,
            status: status?.status || conn.status,
            phoneNumber: status?.phoneNumber ?? conn.phone_number,
            provider: status?.provider || conn.provider,
            error: status?.error,
          };
        })
      );

      if (!isMounted.current) return;

      setConnections(
        updatedConnections.map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status as 'connected' | 'disconnected' | 'connecting',
          phoneNumber: c.phoneNumber,
          provider: c.provider as 'evolution' | 'wapi',
          error: c.error,
        }))
      );

      setLastChecked(new Date());
    } catch (error) {
      console.error('Error checking all connections:', error);
    } finally {
      isCheckingRef.current = false;
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, [fetchConnections, checkConnectionStatus]);

  // Start periodic monitoring
  const startMonitoring = useCallback(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    // Initial check
    checkAllConnections();
    
    // Set up periodic checks
    intervalRef.current = setInterval(() => {
      checkAllConnections();
    }, intervalSeconds * 1000);
  }, [checkAllConnections, intervalSeconds]);

  // Stop periodic monitoring
  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Manual refresh
  const refresh = useCallback(() => {
    checkAllConnections();
  }, [checkAllConnections]);

  // Auto-start monitoring (stable ref to prevent re-runs)
  useEffect(() => {
    isMounted.current = true;
    
    if (autoStart) {
      // Initial check only - interval is started in startMonitoring
      checkAllConnections();
      
      // Set up periodic checks
      intervalRef.current = setInterval(() => {
        checkAllConnections();
      }, intervalSeconds * 1000);
    }
    
    return () => {
      isMounted.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Computed values
  const connectedCount = connections.filter(c => c.status === 'connected').length;
  const totalCount = connections.length;
  const hasConnectedConnection = connectedCount > 0;
  const allConnected = connectedCount === totalCount && totalCount > 0;

  return {
    connections,
    isLoading,
    lastChecked,
    connectedCount,
    totalCount,
    hasConnectedConnection,
    allConnected,
    refresh,
    startMonitoring,
    stopMonitoring,
  };
}
