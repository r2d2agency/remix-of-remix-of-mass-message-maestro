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

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useOrganizations } from '@/hooks/use-organizations';
import { useSuperadmin } from '@/hooks/use-superadmin';
import { toast } from 'sonner';
import { Building2, Plus, Users, Trash2, UserPlus, Crown, Shield, User, Briefcase, Loader2, Pencil } from 'lucide-react';

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  role: 'owner' | 'admin' | 'manager' | 'agent';
  created_at: string;
}

interface OrganizationMember {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'manager' | 'agent';
  created_at: string;
}

const roleLabels = {
  owner: { label: 'Proprietário', icon: Crown, color: 'bg-amber-500' },
  admin: { label: 'Admin', icon: Shield, color: 'bg-blue-500' },
  manager: { label: 'Gerente', icon: Briefcase, color: 'bg-green-500' },
  agent: { label: 'Agente', icon: User, color: 'bg-gray-500' }
};

export default function Organizacoes() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
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
  
  // Add member dialog
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<string>('agent');

  const { 
    loading, 
    error,
    getOrganizations, 
    createOrganization, 
    updateOrganization,
    getMembers, 
    addMember, 
    removeMember 
  } = useOrganizations();

  const { checkSuperadmin } = useSuperadmin();

  useEffect(() => {
    loadOrganizations();
    checkSuperadmin().then(setIsSuperadmin);
  }, []);

  useEffect(() => {
    if (selectedOrg) {
      loadMembers(selectedOrg.id);
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

  const handleAddMember = async () => {
    if (!selectedOrg || !newMemberEmail) {
      toast.error('Informe o email do usuário');
      return;
    }

    const success = await addMember(selectedOrg.id, newMemberEmail, newMemberRole);
    if (success) {
      toast.success('Membro adicionado!');
      setAddMemberDialogOpen(false);
      setNewMemberEmail('');
      setNewMemberRole('agent');
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

  const generateSlug = (name: string) => {
    return name.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
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
                        <Dialog open={addMemberDialogOpen} onOpenChange={setAddMemberDialogOpen}>
                          <DialogTrigger asChild>
                            <Button size="sm">
                              <UserPlus className="h-4 w-4 mr-2" />
                              Adicionar Membro
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Adicionar Membro</DialogTitle>
                              <DialogDescription>
                                Convide um usuário existente para sua organização
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label>Email do usuário</Label>
                                <Input
                                  type="email"
                                  placeholder="usuario@email.com"
                                  value={newMemberEmail}
                                  onChange={(e) => setNewMemberEmail(e.target.value)}
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
                                    <SelectItem value="manager">Gerente - Gerencia equipe</SelectItem>
                                    <SelectItem value="agent">Agente - Acesso básico</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setAddMemberDialogOpen(false)}>
                                Cancelar
                              </Button>
                              <Button onClick={handleAddMember} disabled={loading}>
                                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Adicionar
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
                            <TableHead>Desde</TableHead>
                            {canManageOrg && <TableHead className="w-[100px]">Ações</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {members.map((member) => {
                            const RoleIcon = roleLabels[member.role].icon;
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
                                <TableCell className="text-muted-foreground">
                                  {new Date(member.created_at).toLocaleDateString('pt-BR')}
                                </TableCell>
                                {canManageOrg && (
                                  <TableCell>
                                    {member.role !== 'owner' && (
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
                                    )}
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
      </div>
    </MainLayout>
  );
}
