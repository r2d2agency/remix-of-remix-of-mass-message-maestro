import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useOrganizations } from '@/hooks/use-organizations';
import { useSuperadmin } from '@/hooks/use-superadmin';
import { toast } from 'sonner';
import { Building2, Plus, Users, Trash2, UserPlus, Crown, Shield, User, Briefcase, Loader2, Pencil, Link2, Settings, KeyRound } from 'lucide-react';

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  role: 'owner' | 'admin' | 'manager' | 'agent';
  created_at: string;
}

interface AssignedConnection {
  id: string;
  name: string;
}

interface OrganizationMember {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'manager' | 'agent';
  assigned_connections: AssignedConnection[];
  created_at: string;
}

interface OrgConnection {
  id: string;
  name: string;
  phone_number: string | null;
  status: string;
}

const roleLabels = {
  owner: { label: 'Proprietário', icon: Crown, color: 'bg-amber-500' },
  admin: { label: 'Admin', icon: Shield, color: 'bg-blue-500' },
  manager: { label: 'Supervisor', icon: Briefcase, color: 'bg-green-500' },
  agent: { label: 'Agente', icon: User, color: 'bg-gray-500' }
};

export default function Organizacoes() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [connections, setConnections] = useState<OrgConnection[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  
  // Create org dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSlug, setNewOrgSlug] = useState('');
  
  // Edit org dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editOrgName, setEditOrgName] = useState('');
  
  // Create user dialog
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<string>('agent');
  const [newMemberConnectionIds, setNewMemberConnectionIds] = useState<string[]>([]);

  // Edit member dialog
  const [editMemberDialogOpen, setEditMemberDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<OrganizationMember | null>(null);
  const [editMemberConnectionIds, setEditMemberConnectionIds] = useState<string[]>([]);

  // Edit password dialog
  const [editPasswordDialogOpen, setEditPasswordDialogOpen] = useState(false);
  const [editPasswordMember, setEditPasswordMember] = useState<OrganizationMember | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const { 
    loading, 
    error,
    getOrganizations, 
    createOrganization, 
    updateOrganization,
    getMembers, 
    getConnections,
    addMember, 
    updateMember,
    removeMember,
    updateMemberPassword 
  } = useOrganizations();

  const { checkSuperadmin } = useSuperadmin();

  useEffect(() => {
    loadOrganizations();
    checkSuperadmin().then(setIsSuperadmin);
  }, []);

  useEffect(() => {
    if (selectedOrg) {
      loadMembers(selectedOrg.id);
      loadConnections(selectedOrg.id);
    }
  }, [selectedOrg]);

  const loadOrganizations = async () => {
    setLoadingOrgs(true);
    const orgs = await getOrganizations();
    setOrganizations(orgs);
    if (orgs.length > 0 && !selectedOrg) {
      setSelectedOrg(orgs[0]);
    }
    setLoadingOrgs(false);
  };

  const loadMembers = async (orgId: string) => {
    setLoadingMembers(true);
    const membersList = await getMembers(orgId);
    setMembers(membersList);
    setLoadingMembers(false);
  };

  const loadConnections = async (orgId: string) => {
    const conns = await getConnections(orgId);
    setConnections(conns);
  };

  const handleCreateOrg = async () => {
    if (!newOrgName || !newOrgSlug) {
      toast.error('Preencha todos os campos');
      return;
    }

    const slug = newOrgSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const org = await createOrganization(newOrgName, slug);
    
    if (org) {
      toast.success('Organização criada com sucesso!');
      setCreateDialogOpen(false);
      setNewOrgName('');
      setNewOrgSlug('');
      loadOrganizations();
      setSelectedOrg(org);
    } else if (error) {
      toast.error(error);
    }
  };

  const handleUpdateOrg = async () => {
    if (!selectedOrg || !editOrgName) return;
    
    const updated = await updateOrganization(selectedOrg.id, { name: editOrgName });
    if (updated) {
      toast.success('Organização atualizada!');
      setEditDialogOpen(false);
      loadOrganizations();
      setSelectedOrg({ ...selectedOrg, name: editOrgName });
    } else if (error) {
      toast.error(error);
    }
  };

  const handleCreateUser = async () => {
    if (!selectedOrg) return;
    
    if (!newMemberName || !newMemberEmail || !newMemberPassword) {
      toast.error('Preencha nome, email e senha');
      return;
    }
    if (newMemberPassword.length < 6) {
      toast.error('Senha deve ter pelo menos 6 caracteres');
      return;
    }

    const result = await addMember(selectedOrg.id, {
      email: newMemberEmail,
      role: newMemberRole,
      name: newMemberName,
      password: newMemberPassword,
      connection_ids: newMemberConnectionIds.length > 0 ? newMemberConnectionIds : undefined
    });

    if (result.success) {
      toast.success(result.message || 'Usuário criado com sucesso!');
      resetCreateUserDialog();
      loadMembers(selectedOrg.id);
    } else if (error) {
      toast.error(error);
    }
  };

  const resetCreateUserDialog = () => {
    setCreateUserDialogOpen(false);
    setNewMemberEmail('');
    setNewMemberName('');
    setNewMemberPassword('');
    setNewMemberRole('agent');
    setNewMemberConnectionIds([]);
  };

  const handleOpenEditMember = (member: OrganizationMember) => {
    setEditingMember(member);
    setEditMemberConnectionIds(member.assigned_connections?.map(c => c.id) || []);
    setEditMemberDialogOpen(true);
  };

  const handleUpdateMember = async () => {
    if (!selectedOrg || !editingMember) return;

    const success = await updateMember(selectedOrg.id, editingMember.user_id, {
      connection_ids: editMemberConnectionIds
    });

    if (success) {
      toast.success('Conexões atualizadas!');
      setEditMemberDialogOpen(false);
      setEditingMember(null);
      loadMembers(selectedOrg.id);
    } else if (error) {
      toast.error(error);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedOrg) return;
    
    const success = await removeMember(selectedOrg.id, userId);
    if (success) {
      toast.success('Membro removido!');
      loadMembers(selectedOrg.id);
    } else if (error) {
      toast.error(error);
    }
  };

  const handleOpenEditPassword = (member: OrganizationMember) => {
    setEditPasswordMember(member);
    setNewPassword('');
    setEditPasswordDialogOpen(true);
  };

  const handleUpdatePassword = async () => {
    if (!selectedOrg || !editPasswordMember) return;
    
    if (!newPassword || newPassword.length < 6) {
      toast.error('Senha deve ter pelo menos 6 caracteres');
      return;
    }

    const success = await updateMemberPassword(selectedOrg.id, editPasswordMember.user_id, newPassword);
    if (success) {
      toast.success('Senha atualizada com sucesso!');
      setEditPasswordDialogOpen(false);
      setEditPasswordMember(null);
      setNewPassword('');
    } else if (error) {
      toast.error(error);
    }
  };

  const generateSlug = (name: string) => {
    return name.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const toggleConnection = (connId: string, connectionIds: string[], setConnectionIds: (ids: string[]) => void) => {
    if (connectionIds.includes(connId)) {
      setConnectionIds(connectionIds.filter(id => id !== connId));
    } else {
      setConnectionIds([...connectionIds, connId]);
    }
  };

  const canManageOrg = selectedOrg?.role === 'owner' || selectedOrg?.role === 'admin';

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Organizações</h1>
            <p className="text-muted-foreground">
              Gerencie suas organizações e membros da equipe
            </p>
          </div>
          
          {isSuperadmin && (
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Organização
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Organização</DialogTitle>
                <DialogDescription>
                  Crie uma nova organização para gerenciar sua equipe
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="org-name">Nome</Label>
                  <Input
                    id="org-name"
                    placeholder="Minha Empresa"
                    value={newOrgName}
                    onChange={(e) => {
                      setNewOrgName(e.target.value);
                      setNewOrgSlug(generateSlug(e.target.value));
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-slug">Slug (identificador único)</Label>
                  <Input
                    id="org-slug"
                    placeholder="minha-empresa"
                    value={newOrgSlug}
                    onChange={(e) => setNewOrgSlug(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Usado na URL: whatsale.app/{newOrgSlug || 'slug'}
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreateOrg} disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Criar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-4">
          {/* Sidebar - Organizations List */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Minhas Organizações
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingOrgs ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : organizations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Building2 className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p>Nenhuma organização</p>
                  <p className="text-sm">Crie uma para começar</p>
                </div>
              ) : (
                <div className="divide-y">
                  {organizations.map((org) => (
                    <button
                      key={org.id}
                      onClick={() => setSelectedOrg(org)}
                      className={`w-full text-left p-4 hover:bg-muted/50 transition-colors ${
                        selectedOrg?.id === org.id ? 'bg-muted' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{org.name}</p>
                          <p className="text-xs text-muted-foreground">/{org.slug}</p>
                        </div>
                        <Badge variant="secondary" className={`${roleLabels[org.role].color} text-white text-xs`}>
                          {roleLabels[org.role].label}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Main Content - Selected Organization */}
          <div className="lg:col-span-3 space-y-6">
            {selectedOrg ? (
              <>
                {/* Org Header */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-16 w-16 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Building2 className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-2xl">{selectedOrg.name}</CardTitle>
                          <CardDescription>/{selectedOrg.slug}</CardDescription>
                        </div>
                      </div>
                      {canManageOrg && (
                        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" onClick={() => setEditOrgName(selectedOrg.name)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Editar Organização</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label>Nome</Label>
                                <Input
                                  value={editOrgName}
                                  onChange={(e) => setEditOrgName(e.target.value)}
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                                Cancelar
                              </Button>
                              <Button onClick={handleUpdateOrg} disabled={loading}>
                                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Salvar
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  </CardHeader>
                </Card>

                {/* Members Section */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Users className="h-5 w-5" />
                          Membros da Equipe
                        </CardTitle>
                        <CardDescription>
                          {members.length} membro{members.length !== 1 ? 's' : ''} na organização
                        </CardDescription>
                      </div>
                      {canManageOrg && (
                        <Dialog open={createUserDialogOpen} onOpenChange={(open) => {
                          if (!open) resetCreateUserDialog();
                          else setCreateUserDialogOpen(true);
                        }}>
                          <DialogTrigger asChild>
                            <Button size="sm">
                              <UserPlus className="h-4 w-4 mr-2" />
                              Criar Usuário
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader>
                              <DialogTitle>Criar Novo Usuário</DialogTitle>
                              <DialogDescription>
                                Crie um novo usuário que será automaticamente membro desta organização
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                              <div className="space-y-2">
                                <Label>Nome *</Label>
                                <Input
                                  placeholder="Nome do usuário"
                                  value={newMemberName}
                                  onChange={(e) => setNewMemberName(e.target.value)}
                                />
                              </div>
                              
                              <div className="space-y-2">
                                <Label>Email *</Label>
                                <Input
                                  type="email"
                                  placeholder="usuario@email.com"
                                  value={newMemberEmail}
                                  onChange={(e) => setNewMemberEmail(e.target.value)}
                                />
                              </div>
                              
                              <div className="space-y-2">
                                <Label>Senha *</Label>
                                <Input
                                  type="password"
                                  placeholder="Mínimo 6 caracteres"
                                  value={newMemberPassword}
                                  onChange={(e) => setNewMemberPassword(e.target.value)}
                                />
                              </div>
                              
                              <div className="space-y-2">
                                <Label>Função</Label>
                                <Select value={newMemberRole} onValueChange={setNewMemberRole}>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="admin">Admin - Gerencia tudo</SelectItem>
                                    <SelectItem value="manager">Supervisor - Apenas visualização</SelectItem>
                                    <SelectItem value="agent">Agente - Acesso básico</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              {connections.length > 0 && (
                                <div className="space-y-2">
                                  <Label className="flex items-center gap-2">
                                    <Link2 className="h-4 w-4" />
                                    Conexões permitidas
                                  </Label>
                                  <p className="text-xs text-muted-foreground mb-2">
                                    Selecione as conexões que este usuário pode acessar. Se nenhuma for selecionada, ele verá todas.
                                  </p>
                                  <div className="space-y-2 border rounded-md p-3 max-h-40 overflow-y-auto">
                                    {connections.map((conn) => (
                                      <div key={conn.id} className="flex items-center space-x-2">
                                        <Checkbox
                                          id={`conn-new-${conn.id}`}
                                          checked={newMemberConnectionIds.includes(conn.id)}
                                          onCheckedChange={() => toggleConnection(conn.id, newMemberConnectionIds, setNewMemberConnectionIds)}
                                        />
                                        <label
                                          htmlFor={`conn-new-${conn.id}`}
                                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                                        >
                                          {conn.name}
                                          {conn.phone_number && (
                                            <span className="text-muted-foreground ml-2 text-xs">
                                              ({conn.phone_number})
                                            </span>
                                          )}
                                        </label>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={resetCreateUserDialog}>
                                Cancelar
                              </Button>
                              <Button onClick={handleCreateUser} disabled={loading}>
                                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Criar Usuário
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {loadingMembers ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Usuário</TableHead>
                            <TableHead>Função</TableHead>
                            <TableHead>Conexões</TableHead>
                            <TableHead>Desde</TableHead>
                            {canManageOrg && <TableHead className="w-[120px]">Ações</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {members.map((member) => {
                            const RoleIcon = roleLabels[member.role].icon;
                            const assignedConns = member.assigned_connections || [];
                            return (
                              <TableRow key={member.id}>
                                <TableCell>
                                  <div className="flex items-center gap-3">
                                    <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                                      <User className="h-4 w-4" />
                                    </div>
                                    <div>
                                      <p className="font-medium">{member.name}</p>
                                      <p className="text-sm text-muted-foreground">{member.email}</p>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className={`${roleLabels[member.role].color} text-white`}>
                                    <RoleIcon className="h-3 w-3 mr-1" />
                                    {roleLabels[member.role].label}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {assignedConns.length === 0 ? (
                                    <span className="text-muted-foreground text-sm">Todas</span>
                                  ) : (
                                    <div className="flex flex-wrap gap-1">
                                      {assignedConns.slice(0, 2).map((c) => (
                                        <Badge key={c.id} variant="outline" className="text-xs">
                                          {c.name}
                                        </Badge>
                                      ))}
                                      {assignedConns.length > 2 && (
                                        <Badge variant="outline" className="text-xs">
                                          +{assignedConns.length - 2}
                                        </Badge>
                                      )}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {new Date(member.created_at).toLocaleDateString('pt-BR')}
                                </TableCell>
                                {canManageOrg && (
                                  <TableCell>
                                    <div className="flex items-center gap-1">
                                      {member.role !== 'owner' && (
                                        <>
                                          <Button 
                                            variant="ghost" 
                                            size="icon"
                                            onClick={() => handleOpenEditMember(member)}
                                            title="Gerenciar conexões"
                                          >
                                            <Settings className="h-4 w-4" />
                                          </Button>
                                          <Button 
                                            variant="ghost" 
                                            size="icon"
                                            onClick={() => handleOpenEditPassword(member)}
                                            title="Alterar senha"
                                          >
                                            <KeyRound className="h-4 w-4" />
                                          </Button>
                                          <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                                                <Trash2 className="h-4 w-4" />
                                              </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                              <AlertDialogHeader>
                                                <AlertDialogTitle>Remover membro?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                  {member.name} será removido da organização e perderá acesso a todos os recursos.
                                                </AlertDialogDescription>
                                              </AlertDialogHeader>
                                              <AlertDialogFooter>
                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                <AlertDialogAction
                                                  onClick={() => handleRemoveMember(member.user_id)}
                                                  className="bg-destructive hover:bg-destructive/90"
                                                >
                                                  Remover
                                                </AlertDialogAction>
                                              </AlertDialogFooter>
                                            </AlertDialogContent>
                                          </AlertDialog>
                                        </>
                                      )}
                                    </div>
                                  </TableCell>
                                )}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <Building2 className="h-16 w-16 text-muted-foreground/30 mb-4" />
                  <h3 className="text-lg font-medium mb-2">Nenhuma organização selecionada</h3>
                  <p className="text-muted-foreground mb-4">
                    Selecione uma organização ou crie uma nova para começar
                  </p>
                  <Button onClick={() => setCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Criar Organização
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Edit Member Dialog */}
        <Dialog open={editMemberDialogOpen} onOpenChange={setEditMemberDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Gerenciar Conexões</DialogTitle>
              <DialogDescription>
                Selecione quais conexões {editingMember?.name} pode acessar
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {connections.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  Nenhuma conexão disponível nesta organização
                </p>
              ) : (
                <div className="space-y-2 border rounded-md p-3 max-h-60 overflow-y-auto">
                  {connections.map((conn) => (
                    <div key={conn.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`edit-conn-${conn.id}`}
                        checked={editMemberConnectionIds.includes(conn.id)}
                        onCheckedChange={() => toggleConnection(conn.id, editMemberConnectionIds, setEditMemberConnectionIds)}
                      />
                      <label
                        htmlFor={`edit-conn-${conn.id}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                      >
                        {conn.name}
                        {conn.phone_number && (
                          <span className="text-muted-foreground ml-2 text-xs">
                            ({conn.phone_number})
                          </span>
                        )}
                      </label>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Se nenhuma conexão for selecionada, o usuário terá acesso a todas as conexões da organização.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditMemberDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleUpdateMember} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Password Dialog */}
        <Dialog open={editPasswordDialogOpen} onOpenChange={(open) => {
          if (!open) {
            setEditPasswordDialogOpen(false);
            setEditPasswordMember(null);
            setNewPassword('');
          }
        }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Alterar Senha</DialogTitle>
              <DialogDescription>
                Defina uma nova senha para {editPasswordMember?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova Senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditPasswordDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleUpdatePassword} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}