import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Users, Plus, Trash2, Loader2, UserPlus, BarChart3 } from 'lucide-react';

interface Connection {
  id: string;
  name: string;
  lead_distribution_enabled?: boolean;
}

interface DistributionMember {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  is_active: boolean;
  priority: number;
  max_leads_per_day: number | null;
  leads_today: number;
  last_lead_at: string | null;
}

interface AvailableUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface LeadDistributionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: Connection | null;
}

export function LeadDistributionDialog({ open, onOpenChange, connection }: LeadDistributionDialogProps) {
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [members, setMembers] = useState<DistributionMember[]>([]);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [showAddUsers, setShowAddUsers] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && connection) {
      loadDistributionData();
    }
  }, [open, connection]);

  const loadDistributionData = async () => {
    if (!connection) return;
    
    setLoading(true);
    try {
      const [distData, usersData] = await Promise.all([
        api<{ connection: any; members: DistributionMember[] }>(`/api/lead-distribution/${connection.id}`),
        api<AvailableUser[]>(`/api/lead-distribution/${connection.id}/available-users`)
      ]);
      
      setEnabled(distData.connection?.lead_distribution_enabled || false);
      setMembers(distData.members || []);
      setAvailableUsers(usersData || []);
    } catch (error) {
      console.error('Error loading distribution data:', error);
      toast.error('Erro ao carregar configurações de distribuição');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnabled = async (value: boolean) => {
    if (!connection) return;
    
    setSaving(true);
    try {
      await api(`/api/lead-distribution/${connection.id}/toggle`, {
        method: 'PATCH',
        body: { enabled: value }
      });
      setEnabled(value);
      toast.success(value ? 'Distribuição de leads ativada!' : 'Distribuição de leads desativada');
    } catch (error) {
      toast.error('Erro ao atualizar configuração');
    } finally {
      setSaving(false);
    }
  };

  const handleAddUsers = async () => {
    if (!connection || selectedUsers.length === 0) return;
    
    setSaving(true);
    try {
      await api(`/api/lead-distribution/${connection.id}/members`, {
        method: 'POST',
        body: { user_ids: selectedUsers }
      });
      toast.success(`${selectedUsers.length} usuário(s) adicionado(s)!`);
      setSelectedUsers([]);
      setShowAddUsers(false);
      loadDistributionData();
    } catch (error) {
      toast.error('Erro ao adicionar usuários');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!connection) return;
    
    try {
      await api(`/api/lead-distribution/${connection.id}/members/${userId}`, {
        method: 'DELETE'
      });
      toast.success('Usuário removido da distribuição');
      loadDistributionData();
    } catch (error) {
      toast.error('Erro ao remover usuário');
    }
  };

  const handleToggleMemberActive = async (userId: string, isActive: boolean) => {
    if (!connection) return;
    
    try {
      await api(`/api/lead-distribution/${connection.id}/members/${userId}`, {
        method: 'PATCH',
        body: { is_active: isActive }
      });
      setMembers(prev => prev.map(m => 
        m.user_id === userId ? { ...m, is_active: isActive } : m
      ));
    } catch (error) {
      toast.error('Erro ao atualizar membro');
    }
  };

  const handleUpdateMaxLeads = async (userId: string, maxLeads: string) => {
    if (!connection) return;
    
    const value = maxLeads === '' ? null : parseInt(maxLeads);
    
    try {
      await api(`/api/lead-distribution/${connection.id}/members/${userId}`, {
        method: 'PATCH',
        body: { max_leads_per_day: value }
      });
      setMembers(prev => prev.map(m => 
        m.user_id === userId ? { ...m, max_leads_per_day: value } : m
      ));
    } catch (error) {
      toast.error('Erro ao atualizar limite');
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  if (!connection) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Distribuição de Leads - {connection.name}
          </DialogTitle>
          <DialogDescription>
            Configure a distribuição automática de novos leads entre os usuários selecionados.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            {/* Toggle principal */}
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div>
                <Label className="text-base font-medium">Ativar Distribuição Automática</Label>
                <p className="text-sm text-muted-foreground">
                  Novos leads serão distribuídos automaticamente entre os usuários abaixo
                </p>
              </div>
              <Switch 
                checked={enabled} 
                onCheckedChange={handleToggleEnabled}
                disabled={saving}
              />
            </div>

            {/* Lista de membros */}
            <div className="flex-1 overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium">Usuários na Distribuição ({members.length})</h4>
                {!showAddUsers && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => setShowAddUsers(true)}
                    disabled={availableUsers.length === 0}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Adicionar Usuários
                  </Button>
                )}
              </div>

              {showAddUsers ? (
                <div className="space-y-3 border rounded-lg p-4">
                  <Label>Selecione os usuários para adicionar:</Label>
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-2">
                      {availableUsers.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Todos os usuários já estão na distribuição
                        </p>
                      ) : (
                        availableUsers.map(user => (
                          <div 
                            key={user.id}
                            className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded cursor-pointer"
                            onClick={() => toggleUserSelection(user.id)}
                          >
                            <Checkbox 
                              checked={selectedUsers.includes(user.id)}
                              onCheckedChange={() => toggleUserSelection(user.id)}
                            />
                            <div className="flex-1">
                              <p className="font-medium">{user.name}</p>
                              <p className="text-xs text-muted-foreground">{user.email}</p>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {user.role}
                            </Badge>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                  <div className="flex gap-2 pt-2">
                    <Button 
                      size="sm" 
                      onClick={handleAddUsers}
                      disabled={selectedUsers.length === 0 || saving}
                    >
                      {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Adicionar {selectedUsers.length > 0 && `(${selectedUsers.length})`}
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => {
                        setShowAddUsers(false);
                        setSelectedUsers([]);
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <ScrollArea className="h-[300px]">
                  {members.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Users className="h-12 w-12 text-muted-foreground/50 mb-3" />
                      <p className="text-muted-foreground">
                        Nenhum usuário adicionado à distribuição
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Adicione usuários para começar a distribuir leads automaticamente
                      </p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Usuário</TableHead>
                          <TableHead className="w-[100px] text-center">Ativo</TableHead>
                          <TableHead className="w-[120px] text-center">Limite/Dia</TableHead>
                          <TableHead className="w-[80px] text-center">Hoje</TableHead>
                          <TableHead className="w-[60px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {members.map(member => (
                          <TableRow key={member.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{member.user_name}</p>
                                <p className="text-xs text-muted-foreground">{member.user_email}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Switch 
                                checked={member.is_active}
                                onCheckedChange={(val) => handleToggleMemberActive(member.user_id, val)}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                className="h-8 w-20 text-center"
                                placeholder="∞"
                                value={member.max_leads_per_day ?? ''}
                                onChange={(e) => handleUpdateMaxLeads(member.user_id, e.target.value)}
                                min={0}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={member.leads_today > 0 ? "default" : "secondary"}>
                                {member.leads_today}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => handleRemoveMember(member.user_id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </ScrollArea>
              )}
            </div>

            {/* Informação sobre como funciona */}
            <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">
              <p className="font-medium mb-1">Como funciona:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Leads novos são distribuídos em formato <strong>round-robin</strong></li>
                <li>Usuários inativos não recebem leads</li>
                <li>Configure um limite diário por usuário (deixe vazio para sem limite)</li>
                <li>Os contadores são resetados automaticamente todo dia</li>
              </ul>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
