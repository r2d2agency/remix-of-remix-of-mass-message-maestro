import { useState, useEffect, useRef } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useOrganizations } from '@/hooks/use-organizations';
import { useSuperadmin } from '@/hooks/use-superadmin';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Building2, Plus, Users, Trash2, UserPlus, Crown, Shield, User, Briefcase, Loader2, Pencil, Link2, Settings, KeyRound, Megaphone, Receipt, UsersRound, CalendarClock, Bot, Layers, MessagesSquare, Upload, Image } from 'lucide-react';
import { useUpload } from '@/hooks/use-upload';

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

interface AssignedDepartment {
  id: string;
  name: string;
  role: string;
}

interface OrganizationMember {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'manager' | 'agent';
  assigned_connections: AssignedConnection[];
  assigned_departments: AssignedDepartment[];
  created_at: string;
}

interface OrgConnection {
  id: string;
  name: string;
  phone_number: string | null;
  status: string;
}

interface OrgDepartment {
  id: string;
  name: string;
  color: string;
  icon: string;
  is_active: boolean;
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
  const [departments, setDepartments] = useState<OrgDepartment[]>([]);
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
  const [editOrgLogo, setEditOrgLogo] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  
  // Create user dialog
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<string>('agent');
  const [newMemberConnectionIds, setNewMemberConnectionIds] = useState<string[]>([]);
  const [newMemberDepartmentIds, setNewMemberDepartmentIds] = useState<string[]>([]);

  // Edit member dialog
  const [editMemberDialogOpen, setEditMemberDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<OrganizationMember | null>(null);
  const [editMemberRole, setEditMemberRole] = useState<string>('agent');
  const [editMemberConnectionIds, setEditMemberConnectionIds] = useState<string[]>([]);
  const [editMemberDepartmentIds, setEditMemberDepartmentIds] = useState<string[]>([]);

  // Edit password dialog
  const [editPasswordDialogOpen, setEditPasswordDialogOpen] = useState(false);
  const [editPasswordMember, setEditPasswordMember] = useState<OrganizationMember | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Modules settings
  const [activeTab, setActiveTab] = useState('members');
  const [modulesEnabled, setModulesEnabled] = useState({
    campaigns: true,
    billing: true,
    groups: true,
    scheduled_messages: true,
    chatbots: true,
    chat: true,
    crm: true,
  });
  const [savingModules, setSavingModules] = useState(false);

  const { 
    loading, 
    error,
    getOrganizations, 
    createOrganization, 
    updateOrganization,
    getMembers, 
    getConnections,
    getDepartments,
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
      loadDepartments(selectedOrg.id);
      loadModules(selectedOrg.id);
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

  const loadDepartments = async (orgId: string) => {
    const depts = await getDepartments(orgId);
    setDepartments(depts);
  };

  const loadModules = async (orgId: string) => {
    try {
      const modules = await api<Record<string, boolean>>(`/api/organizations/${orgId}/modules`);
      setModulesEnabled({
        campaigns: modules.campaigns ?? true,
        billing: modules.billing ?? true,
        groups: modules.groups ?? true,
        scheduled_messages: modules.scheduled_messages ?? true,
        chatbots: modules.chatbots ?? true,
        chat: modules.chat ?? true,
        crm: modules.crm ?? true,
      });
    } catch (error) {
      console.error('Error loading modules:', error);
    }
  };

  const handleSaveModules = async () => {
    if (!selectedOrg) return;
    
    setSavingModules(true);
    try {
      await api(`/api/organizations/${selectedOrg.id}`, {
        method: 'PATCH',
        body: { modules_enabled: modulesEnabled },
      });
      toast.success('Configurações salvas!');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar configurações');
    } finally {
      setSavingModules(false);
    }
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

  const { uploadFile, isUploading: isUploadingLogo } = useUpload();

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadFile(file);
      if (url) setEditOrgLogo(url);
    } catch {
      toast.error('Erro ao enviar logo');
    }
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handleUpdateOrg = async () => {
    if (!selectedOrg || !editOrgName) return;
    
    const data: { name?: string; logo_url?: string } = { name: editOrgName };
    if (editOrgLogo !== undefined) data.logo_url = editOrgLogo || '';
    
    const updated = await updateOrganization(selectedOrg.id, data);
    if (updated) {
      toast.success('Organização atualizada!');
      setEditDialogOpen(false);
      loadOrganizations();
      setSelectedOrg({ ...selectedOrg, name: editOrgName, logo_url: editOrgLogo });
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
      connection_ids: newMemberConnectionIds.length > 0 ? newMemberConnectionIds : undefined,
      department_ids: newMemberDepartmentIds.length > 0 ? newMemberDepartmentIds : undefined
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
    setNewMemberDepartmentIds([]);
  };

  const handleOpenEditMember = (member: OrganizationMember) => {
    setEditingMember(member);
    setEditMemberRole(member.role);
    setEditMemberConnectionIds(member.assigned_connections?.map(c => c.id) || []);
    setEditMemberDepartmentIds(member.assigned_departments?.map(d => d.id) || []);
    setEditMemberDialogOpen(true);
  };

  const handleUpdateMember = async () => {
    if (!selectedOrg || !editingMember) return;

    const updateData: { role?: string; connection_ids?: string[]; department_ids?: string[] } = {
      connection_ids: editMemberConnectionIds,
      department_ids: editMemberDepartmentIds,
    };
    
    // Only include role if it's different and member is not owner
    if (editingMember.role !== 'owner' && editMemberRole !== editingMember.role) {
      updateData.role = editMemberRole;
    }

    const success = await updateMember(selectedOrg.id, editingMember.user_id, updateData);

    if (success) {
      toast.success('Membro atualizado!');
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
      <div className="space-y-6 overflow-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">Organizações</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Gerencie suas organizações e membros da equipe
            </p>
          </div>
          
          {isSuperadmin && (
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="shrink-0 w-full sm:w-auto">
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

        <div className="grid gap-6 lg:grid-cols-4 min-w-0">
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
          <div className="lg:col-span-3 space-y-6 min-w-0 overflow-hidden">
            {selectedOrg ? (
              <>
                {/* Org Header */}
                <Card>
                  <CardHeader className="p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                        {selectedOrg.logo_url ? (
                          <img src={selectedOrg.logo_url} alt={selectedOrg.name} className="h-12 w-12 sm:h-16 sm:w-16 rounded-xl object-contain shrink-0" />
                        ) : (
                          <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <Building2 className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <CardTitle className="text-xl sm:text-2xl truncate">{selectedOrg.name}</CardTitle>
                          <CardDescription className="truncate">/{selectedOrg.slug}</CardDescription>
                        </div>
                      </div>
                      {canManageOrg && (
                        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" onClick={() => { setEditOrgName(selectedOrg.name); setEditOrgLogo(selectedOrg.logo_url); }} className="shrink-0 w-full sm:w-auto">
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
                              <div className="space-y-2">
                                <Label>Logo</Label>
                                <input
                                  ref={logoInputRef}
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={handleLogoUpload}
                                />
                                {editOrgLogo ? (
                                  <div className="space-y-2">
                                    <div className="rounded-lg border bg-muted/50 p-3 flex items-center justify-center">
                                      <img src={editOrgLogo} alt="Logo" className="max-h-20 max-w-full object-contain" />
                                    </div>
                                    <div className="flex gap-2">
                                      <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => logoInputRef.current?.click()} disabled={isUploadingLogo}>
                                        {isUploadingLogo ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
                                        Alterar
                                      </Button>
                                      <Button type="button" variant="outline" size="sm" onClick={() => setEditOrgLogo(null)} className="text-destructive hover:text-destructive">
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <Button type="button" variant="outline" className="w-full h-20 border-dashed flex flex-col gap-1" onClick={() => logoInputRef.current?.click()} disabled={isUploadingLogo}>
                                    {isUploadingLogo ? (
                                      <Loader2 className="h-5 w-5 animate-spin" />
                                    ) : (
                                      <>
                                        <Image className="h-5 w-5" />
                                        <span className="text-xs">Clique para enviar logo</span>
                                      </>
                                    )}
                                  </Button>
                                )}
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

                {/* Tabs for Members and Settings */}
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="members" className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Membros
                    </TabsTrigger>
                    <TabsTrigger value="settings" className="flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      Configurações
                    </TabsTrigger>
                  </TabsList>

                  {/* Members Tab */}
                  <TabsContent value="members">
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
                                <TableHead>Departamentos</TableHead>
                                <TableHead>Desde</TableHead>
                                {canManageOrg && <TableHead className="w-[120px]">Ações</TableHead>}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {members.map((member) => {
                                const RoleIcon = roleLabels[member.role].icon;
                                const assignedConns = member.assigned_connections || [];
                                const assignedDepts = member.assigned_departments || [];
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
                                    <TableCell>
                                      {assignedDepts.length === 0 ? (
                                        <span className="text-muted-foreground text-sm">-</span>
                                      ) : (
                                        <div className="flex flex-wrap gap-1">
                                          {assignedDepts.slice(0, 2).map((d) => (
                                            <Badge key={d.id} variant="secondary" className="text-xs">
                                              {d.name}
                                            </Badge>
                                          ))}
                                          {assignedDepts.length > 2 && (
                                            <Badge variant="secondary" className="text-xs">
                                              +{assignedDepts.length - 2}
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
                                              title="Editar membro"
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
                  </TabsContent>

                  {/* Settings Tab */}
                  <TabsContent value="settings">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Settings className="h-5 w-5" />
                          Módulos Habilitados
                        </CardTitle>
                        <CardDescription>
                          Ative ou desative funcionalidades para esta organização
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {/* Campaigns */}
                        <div className="flex items-center justify-between rounded-lg border p-4">
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                              <Megaphone className="h-5 w-5 text-orange-500" />
                            </div>
                            <div>
                              <p className="font-medium">Campanhas</p>
                              <p className="text-sm text-muted-foreground">
                                Disparo em massa para listas de contatos
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={modulesEnabled.campaigns}
                            onCheckedChange={(checked) => setModulesEnabled(prev => ({ ...prev, campaigns: checked }))}
                            disabled={!canManageOrg}
                          />
                        </div>

                        {/* Billing (Asaas) */}
                        <div className="flex items-center justify-between rounded-lg border p-4">
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                              <Receipt className="h-5 w-5 text-green-500" />
                            </div>
                            <div>
                              <p className="font-medium">Cobranças (Asaas)</p>
                              <p className="text-sm text-muted-foreground">
                                Integração com Asaas para lembretes de pagamento
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={modulesEnabled.billing}
                            onCheckedChange={(checked) => setModulesEnabled(prev => ({ ...prev, billing: checked }))}
                            disabled={!canManageOrg}
                          />
                        </div>

                        {/* Groups */}
                        <div className="flex items-center justify-between rounded-lg border p-4">
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                              <UsersRound className="h-5 w-5 text-blue-500" />
                            </div>
                            <div>
                              <p className="font-medium">Grupos WhatsApp</p>
                              <p className="text-sm text-muted-foreground">
                                Atendimento e gestão de grupos
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={modulesEnabled.groups}
                            onCheckedChange={(checked) => setModulesEnabled(prev => ({ ...prev, groups: checked }))}
                            disabled={!canManageOrg}
                          />
                        </div>

                        {/* Scheduled Messages */}
                        <div className="flex items-center justify-between rounded-lg border p-4">
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                              <CalendarClock className="h-5 w-5 text-purple-500" />
                            </div>
                            <div>
                              <p className="font-medium">Mensagens Agendadas</p>
                              <p className="text-sm text-muted-foreground">
                                Agendar envio de mensagens para data/hora específica
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={modulesEnabled.scheduled_messages}
                            onCheckedChange={(checked) => setModulesEnabled(prev => ({ ...prev, scheduled_messages: checked }))}
                            disabled={!canManageOrg}
                          />
                        </div>

                        {/* Chat */}
                        <div className="flex items-center justify-between rounded-lg border p-4">
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                              <MessagesSquare className="h-5 w-5 text-indigo-500" />
                            </div>
                            <div>
                              <p className="font-medium">Chat WhatsApp</p>
                              <p className="text-sm text-muted-foreground">
                                Atendimento e conversa com clientes via WhatsApp
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={modulesEnabled.chat}
                            onCheckedChange={(checked) => setModulesEnabled(prev => ({ ...prev, chat: checked }))}
                            disabled={!canManageOrg}
                          />
                        </div>

                        {/* Chatbots */}
                        <div className="flex items-center justify-between rounded-lg border p-4">
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                              <Bot className="h-5 w-5 text-cyan-500" />
                            </div>
                            <div>
                              <p className="font-medium">Chatbots</p>
                              <p className="text-sm text-muted-foreground">
                                Automações, fluxos e menus interativos de atendimento
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={modulesEnabled.chatbots}
                            onCheckedChange={(checked) => setModulesEnabled(prev => ({ ...prev, chatbots: checked }))}
                            disabled={!canManageOrg}
                          />
                        </div>

                        {/* CRM */}
                        <div className="flex items-center justify-between rounded-lg border p-4">
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                              <Briefcase className="h-5 w-5 text-amber-500" />
                            </div>
                            <div>
                              <p className="font-medium">CRM</p>
                              <p className="text-sm text-muted-foreground">
                                Gestão de negociações, empresas e tarefas comerciais
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={modulesEnabled.crm}
                            onCheckedChange={(checked) => setModulesEnabled(prev => ({ ...prev, crm: checked }))}
                            disabled={!canManageOrg}
                          />
                        </div>

                        {/* Save Button */}
                        {canManageOrg && (
                          <div className="flex justify-end pt-4">
                            <Button onClick={handleSaveModules} disabled={savingModules}>
                              {savingModules && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                              Salvar Configurações
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
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
          <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
            <DialogHeader className="shrink-0">
              <DialogTitle>Editar Membro</DialogTitle>
              <DialogDescription>
                Gerenciar cargo, conexões e departamentos de {editingMember?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-6 overflow-y-auto flex-1 pr-2">
              {/* Role - only if not owner */}
              {editingMember?.role !== 'owner' && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Cargo
                  </Label>
                  <Select value={editMemberRole} onValueChange={setEditMemberRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin - Gerencia tudo</SelectItem>
                      <SelectItem value="manager">Supervisor - Visualização avançada</SelectItem>
                      <SelectItem value="agent">Agente - Acesso básico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Connections */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Conexões permitidas
                </Label>
                {connections.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-2">
                    Nenhuma conexão disponível
                  </p>
                ) : (
                  <div className="space-y-2 border rounded-md p-3 max-h-40 overflow-y-auto">
                    {connections.map((conn) => (
                      <div key={conn.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`edit-conn-${conn.id}`}
                          checked={editMemberConnectionIds.includes(conn.id)}
                          onCheckedChange={() => toggleConnection(conn.id, editMemberConnectionIds, setEditMemberConnectionIds)}
                        />
                        <label
                          htmlFor={`edit-conn-${conn.id}`}
                          className="text-sm font-medium leading-none cursor-pointer flex-1"
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
                <p className="text-xs text-muted-foreground">
                  Sem seleção = acesso a todas as conexões
                </p>
              </div>

              {/* Departments */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Departamentos (Filas)
                </Label>
                {departments.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-2">
                    Nenhum departamento cadastrado
                  </p>
                ) : (
                  <div className="space-y-2 border rounded-md p-3 max-h-40 overflow-y-auto">
                    {departments.filter(d => d.is_active).map((dept) => (
                      <div key={dept.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`edit-dept-${dept.id}`}
                          checked={editMemberDepartmentIds.includes(dept.id)}
                          onCheckedChange={() => {
                            if (editMemberDepartmentIds.includes(dept.id)) {
                              setEditMemberDepartmentIds(prev => prev.filter(id => id !== dept.id));
                            } else {
                              setEditMemberDepartmentIds(prev => [...prev, dept.id]);
                            }
                          }}
                        />
                        <label
                          htmlFor={`edit-dept-${dept.id}`}
                          className="text-sm font-medium leading-none cursor-pointer flex-1 flex items-center gap-2"
                        >
                          <span 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: dept.color || '#6366f1' }}
                          />
                          {dept.name}
                        </label>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Selecione os departamentos que este usuário pode atender
                </p>
              </div>
            </div>
            <DialogFooter className="shrink-0">
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