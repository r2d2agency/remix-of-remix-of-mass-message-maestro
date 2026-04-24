import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface AASPIntimacao {
  id: string;
  organization_id: string;
  external_id: string;
  jornal: string | null;
  data_publicacao: string | null;
  data_disponibilizacao: string | null;
  caderno: string | null;
  pagina: string | null;
  comarca: string | null;
  vara: string | null;
  processo: string | null;
  tipo: string | null;
  conteudo: string | null;
  partes: string | null;
  advogados: string | null;
  read: boolean;
  created_at: string;
}

// Mock Data
const MOCK_INTIMACOES: AASPIntimacao[] = [
  {
    id: "1",
    organization_id: "org1",
    external_id: "ext1",
    jornal: "Diário de Justiça de São Paulo",
    data_publicacao: new Date().toISOString(),
    data_disponibilizacao: new Date().toISOString(),
    caderno: "Judicial I",
    pagina: "125",
    comarca: "São Paulo",
    vara: "2ª Vara Cível",
    processo: "1002345-67.2023.8.26.0100",
    tipo: "Publicação de Despacho",
    conteudo: "Vistos. Ante a certidão supra, manifeste-se a parte autora sobre o prosseguimento do feito no prazo de 5 dias.",
    partes: "João Silva vs. Banco do Brasil S/A",
    advogados: "Dr. Ricardo Almeida (OAB/SP 123.456)",
    read: false,
    created_at: new Date().toISOString(),
  },
  {
    id: "2",
    organization_id: "org1",
    external_id: "ext2",
    jornal: "Diário de Justiça Federal",
    data_publicacao: new Date(Date.now() - 86400000).toISOString(),
    data_disponibilizacao: new Date(Date.now() - 86400000).toISOString(),
    caderno: "Administrativo",
    pagina: "45",
    comarca: "Tribunal Regional Federal",
    vara: "1ª Turma Recursal",
    processo: "5001234-89.2022.4.03.6100",
    tipo: "Inclusão em Pauta",
    conteudo: "Ficam as partes intimadas da inclusão do processo em epígrafe na pauta de julgamentos da sessão virtual do dia 15/10.",
    partes: "Maria Oliveira vs. INSS",
    advogados: "Dra. Camila Santos (OAB/SP 234.567)",
    read: true,
    created_at: new Date(Date.now() - 86400000).toISOString(),
  }
];

export function useAASPConfig() {
  return { 
    config: {
      id: "config1",
      organization_id: "org1",
      api_token_masked: "••••••••••••1234",
      notify_phone: "11999999999",
      connection_id: "conn1",
      is_active: true,
      last_sync_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }, 
    isLoading: false, 
    saveConfig: { mutate: () => {}, isPending: false } 
  };
}

export function useAASPIntimacoes(page = 1, unreadOnly = false) {
  return useQuery({
    queryKey: ['aasp-intimacoes', page, unreadOnly],
    queryFn: async () => {
      await new Promise(r => setTimeout(r, 800));
      const filtered = unreadOnly ? MOCK_INTIMACOES.filter(i => !i.read) : MOCK_INTIMACOES;
      return { data: filtered, total: filtered.length, page: 1, limit: 50 };
    },
  });
}

export function useAASPUnreadCount() {
  return useQuery({
    queryKey: ['aasp-unread-count'],
    queryFn: async () => ({ count: MOCK_INTIMACOES.filter(i => !i.read).length }),
    refetchInterval: 60000,
  });
}

export function useAASPActions() {
  const queryClient = useQueryClient();

  const markRead = useMutation({
    mutationFn: async (ids?: string[]) => {
      await new Promise(r => setTimeout(r, 500));
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aasp-intimacoes'] });
      queryClient.invalidateQueries({ queryKey: ['aasp-unread-count'] });
    },
  });

  const syncNow = useMutation({
    mutationFn: async () => {
      await new Promise(r => setTimeout(r, 1500));
      return { success: true, newCount: 0, total: MOCK_INTIMACOES.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aasp-intimacoes'] });
      queryClient.invalidateQueries({ queryKey: ['aasp-unread-count'] });
    },
  });

  return { markRead, syncNow };
}