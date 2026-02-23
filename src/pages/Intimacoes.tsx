import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Scale, Search, RefreshCw, Loader2, Eye, EyeOff, CheckCheck, FileText, Calendar, MapPin, Gavel, ChevronLeft, ChevronRight } from "lucide-react";
import { useAASPIntimacoes, useAASPUnreadCount, useAASPActions, type AASPIntimacao } from "@/hooks/use-aasp";
import { toast } from "sonner";

const Intimacoes = () => {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIntimacao, setSelectedIntimacao] = useState<AASPIntimacao | null>(null);

  const { data, isLoading } = useAASPIntimacoes(page, unreadOnly);
  const { data: unreadData } = useAASPUnreadCount();
  const { markRead, syncNow } = useAASPActions();

  const handleSync = async () => {
    try {
      const result = await syncNow.mutateAsync();
      if (result.success) {
        toast.success(`${result.newCount} novas intimações encontradas`);
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao sincronizar");
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markRead.mutateAsync(undefined);
      toast.success("Todas as intimações marcadas como lidas");
    } catch {
      toast.error("Erro ao marcar como lidas");
    }
  };

  const handleOpenIntimacao = async (item: AASPIntimacao) => {
    setSelectedIntimacao(item);
    if (!item.read) {
      try {
        await markRead.mutateAsync([item.id]);
      } catch {
        // silent
      }
    }
  };

  const intimacoes = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 50);
  const unreadCount = unreadData?.count || 0;

  const filtered = search
    ? intimacoes.filter(i =>
        (i.processo || '').toLowerCase().includes(search.toLowerCase()) ||
        (i.conteudo || '').toLowerCase().includes(search.toLowerCase()) ||
        (i.partes || '').toLowerCase().includes(search.toLowerCase()) ||
        (i.comarca || '').toLowerCase().includes(search.toLowerCase())
      )
    : intimacoes;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <Scale className="h-8 w-8 text-primary" />
              Intimações AASP
            </h1>
            <p className="mt-1 text-muted-foreground">
              Acompanhe suas intimações e publicações jurídicas
            </p>
          </div>
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={handleMarkAllRead} disabled={markRead.isPending}>
                <CheckCheck className="h-4 w-4 mr-2" />
                Marcar todas como lidas ({unreadCount})
              </Button>
            )}
            <Button onClick={handleSync} disabled={syncNow.isPending} size="sm">
              {syncNow.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sincronizar
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-4 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por processo, comarca, partes..."
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={unreadOnly} onCheckedChange={setUnreadOnly} id="unread-filter" />
            <Label htmlFor="unread-filter" className="text-sm">Apenas não lidas</Label>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">{unreadCount}</p>
              <p className="text-xs text-muted-foreground">Não lidas</p>
            </CardContent>
          </Card>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <Scale className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium text-foreground">Nenhuma intimação encontrada</p>
              <p className="text-sm text-muted-foreground mt-1">
                {unreadOnly ? "Todas as intimações já foram lidas" : "Configure a integração AASP nas configurações"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => (
              <Card
                key={item.id}
                className={`cursor-pointer transition-colors hover:bg-accent/50 ${!item.read ? 'border-primary/50 bg-primary/5' : ''}`}
                onClick={() => handleOpenIntimacao(item)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {!item.read && (
                          <Badge variant="default" className="text-xs">Nova</Badge>
                        )}
                        {item.processo && (
                          <span className="font-mono text-sm font-semibold text-foreground">
                            {item.processo}
                          </span>
                        )}
                        {item.tipo && (
                          <Badge variant="outline" className="text-xs">{item.tipo}</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                        {item.comarca && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />{item.comarca}
                          </span>
                        )}
                        {item.vara && (
                          <span className="flex items-center gap-1">
                            <Gavel className="h-3 w-3" />{item.vara}
                          </span>
                        )}
                        {item.data_publicacao && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(item.data_publicacao).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                        {item.jornal && (
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />{item.jornal}
                          </span>
                        )}
                      </div>
                      {item.conteudo && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                          {item.conteudo}
                        </p>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" className="shrink-0">
                      {item.read ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Página {page} de {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedIntimacao} onOpenChange={(open) => !open && setSelectedIntimacao(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              Detalhes da Intimação
            </DialogTitle>
          </DialogHeader>
          {selectedIntimacao && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 pr-4">
                {selectedIntimacao.processo && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Processo</Label>
                    <p className="font-mono font-semibold">{selectedIntimacao.processo}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  {selectedIntimacao.comarca && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Comarca</Label>
                      <p className="text-sm">{selectedIntimacao.comarca}</p>
                    </div>
                  )}
                  {selectedIntimacao.vara && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Vara</Label>
                      <p className="text-sm">{selectedIntimacao.vara}</p>
                    </div>
                  )}
                  {selectedIntimacao.data_publicacao && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Data de Publicação</Label>
                      <p className="text-sm">{new Date(selectedIntimacao.data_publicacao).toLocaleDateString('pt-BR')}</p>
                    </div>
                  )}
                  {selectedIntimacao.jornal && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Jornal</Label>
                      <p className="text-sm">{selectedIntimacao.jornal}</p>
                    </div>
                  )}
                  {selectedIntimacao.caderno && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Caderno</Label>
                      <p className="text-sm">{selectedIntimacao.caderno}</p>
                    </div>
                  )}
                  {selectedIntimacao.pagina && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Página</Label>
                      <p className="text-sm">{selectedIntimacao.pagina}</p>
                    </div>
                  )}
                  {selectedIntimacao.tipo && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Tipo</Label>
                      <p className="text-sm">{selectedIntimacao.tipo}</p>
                    </div>
                  )}
                </div>
                {selectedIntimacao.partes && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Partes</Label>
                    <p className="text-sm whitespace-pre-wrap">{selectedIntimacao.partes}</p>
                  </div>
                )}
                {selectedIntimacao.advogados && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Advogados</Label>
                    <p className="text-sm whitespace-pre-wrap">{selectedIntimacao.advogados}</p>
                  </div>
                )}
                {selectedIntimacao.conteudo && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Conteúdo</Label>
                    <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">{selectedIntimacao.conteudo}</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Intimacoes;
