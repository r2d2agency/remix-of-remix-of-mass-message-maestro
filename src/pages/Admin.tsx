import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useSuperadmin } from '@/hooks/use-superadmin';
import { useAdminSettings } from '@/hooks/use-branding';
import { useUpload } from '@/hooks/use-upload';
import { BrandingTab } from '@/components/admin/BrandingTab';
import { toast } from 'sonner';
import { Shield, Building2, Users, Plus, Trash2, Loader2, Pencil, Crown, Image, Package, CalendarIcon, UserPlus, Eye, MessageSquare, Receipt, Wifi, Upload, Palette, Bot, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface User {
  id: string;
  email: string;
  name: string;
  is_superadmin: boolean;
  created_at: string;
}

interface Plan {
  id: string;
  name: string;
  description: string | null;
  max_connections: number;
  max_monthly_messages: number;
  max_users: number;
  max_supervisors: number;
  has_asaas_integration: boolean;
  has_chat: boolean;
  has_whatsapp_groups: boolean;
  has_campaigns: boolean;
  has_chatbots: boolean;
  has_scheduled_messages: boolean;
  price: number;
  billing_period: string;
  is_active: boolean;
  visible_on_signup: boolean;
  trial_days: number;
  org_count?: number;
  created_at: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan_id: string | null;
  plan_name?: string;
  plan_price?: number;
  expires_at: string | null;
  member_count?: number;
  created_at: string;
}

interface OrgMember {
  id: string;
  user_id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

export default function Admin() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  
  // Create org dialog
  const [createOrgDialogOpen, setCreateOrgDialogOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSlug, setNewOrgSlug] = useState('');
  const [newOrgLogo, setNewOrgLogo] = useState('');
  const [newOrgOwner, setNewOrgOwner] = useState('');
  const [newOrgOwnerName, setNewOrgOwnerName] = useState('');
  const [newOrgOwnerPassword, setNewOrgOwnerPassword] = useState('');
  const [newOrgPlan, setNewOrgPlan] = useState('');
  const [newOrgExpires, setNewOrgExpires] = useState<Date | undefined>();

  // Edit org dialog
  const [editOrgDialogOpen, setEditOrgDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [editOrgName, setEditOrgName] = useState('');
  const [editOrgLogo, setEditOrgLogo] = useState('');
  const [editOrgPlan, setEditOrgPlan] = useState('');
  const [editOrgExpires, setEditOrgExpires] = useState<Date | undefined>();

  // Create plan dialog
  const [createPlanDialogOpen, setCreatePlanDialogOpen] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanDescription, setNewPlanDescription] = useState('');
  const [newPlanConnections, setNewPlanConnections] = useState('1');
  const [newPlanMessages, setNewPlanMessages] = useState('1000');
  const [newPlanUsers, setNewPlanUsers] = useState('5');
  const [newPlanSupervisors, setNewPlanSupervisors] = useState('1');
  const [newPlanPrice, setNewPlanPrice] = useState('0');
  const [newPlanAsaas, setNewPlanAsaas] = useState(false);
  const [newPlanChat, setNewPlanChat] = useState(true);
  const [newPlanGroups, setNewPlanGroups] = useState(false);
  const [newPlanCampaigns, setNewPlanCampaigns] = useState(true);
  const [newPlanChatbots, setNewPlanChatbots] = useState(true);
  const [newPlanScheduled, setNewPlanScheduled] = useState(true);
  const [newPlanPeriod, setNewPlanPeriod] = useState('monthly');
  const [newPlanVisibleOnSignup, setNewPlanVisibleOnSignup] = useState(false);
  const [newPlanTrialDays, setNewPlanTrialDays] = useState('3');

  // Edit plan dialog
  const [editPlanDialogOpen, setEditPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);

  // Organization members dialog
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [orgLimits, setOrgLimits] = useState<{
    max_users: number;
    max_supervisors: number;
    current_users: number;
    current_supervisors: number;
    plan_name: string;
  } | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Add user to org dialog
  const [addUserDialogOpen, setAddUserDialogOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('agent');

  const { 
    loading: actionLoading,
    error,
    checkSuperadmin,
    getAllUsers,
    getAllOrganizations,
    getAllPlans,
    createOrganization,
    updateOrganization,
    deleteOrganization,
    createPlan,
    updatePlan,
    deletePlan,
    setSuperadmin,
    getOrganizationMembers,
    createOrganizationUser,
    updateMemberRole,
    removeMember
  } = useSuperadmin();

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    const isAdmin = await checkSuperadmin();
    setIsSuperadmin(isAdmin);
    
    if (!isAdmin) {
      toast.error('Acesso negado. Apenas superadmins podem acessar esta página.');
      navigate('/');
      return;
    }
    
    loadData();
  };

  const loadData = async () => {
    setLoading(true);
    const [usersData, orgsData, plansData] = await Promise.all([
      getAllUsers(),
      getAllOrganizations(),
      getAllPlans()
    ]);
    setUsers(usersData);
    setOrganizations(orgsData);
    setPlans(plansData);
    setLoading(false);
  };

  const generateSlug = (name: string) => {
    return name.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  // ============================================
  // PLANS HANDLERS
  // ============================================

  const handleCreatePlan = async () => {
    if (!newPlanName) {
      toast.error('Nome do plano é obrigatório');
      return;
    }

    const plan = await createPlan({
      name: newPlanName,
      description: newPlanDescription || undefined,
      max_connections: parseInt(newPlanConnections) || 1,
      max_monthly_messages: parseInt(newPlanMessages) || 1000,
      max_users: parseInt(newPlanUsers) || 5,
      max_supervisors: parseInt(newPlanSupervisors) || 1,
      has_asaas_integration: newPlanAsaas,
      has_chat: newPlanChat,
      has_whatsapp_groups: newPlanGroups,
      has_campaigns: newPlanCampaigns,
      has_chatbots: newPlanChatbots,
      has_scheduled_messages: newPlanScheduled,
      price: parseFloat(newPlanPrice) || 0,
      billing_period: newPlanPeriod,
      visible_on_signup: newPlanVisibleOnSignup,
      trial_days: parseInt(newPlanTrialDays) || 3
    });

    if (plan) {
      toast.success('Plano criado com sucesso!');
      setCreatePlanDialogOpen(false);
      resetPlanForm();
      loadData();
    } else if (error) {
      toast.error(error);
    }
  };

  const resetPlanForm = () => {
    setNewPlanName('');
    setNewPlanDescription('');
    setNewPlanConnections('1');
    setNewPlanMessages('1000');
    setNewPlanUsers('5');
    setNewPlanSupervisors('1');
    setNewPlanPrice('0');
    setNewPlanAsaas(false);
    setNewPlanChat(true);
    setNewPlanGroups(false);
    setNewPlanCampaigns(true);
    setNewPlanChatbots(true);
    setNewPlanScheduled(true);
    setNewPlanPeriod('monthly');
    setNewPlanVisibleOnSignup(false);
    setNewPlanTrialDays('3');
  };

  const handleUpdatePlan = async () => {
    if (!editingPlan) return;

    const updated = await updatePlan(editingPlan.id, {
      name: editingPlan.name,
      description: editingPlan.description,
      max_connections: editingPlan.max_connections,
      max_monthly_messages: editingPlan.max_monthly_messages,
      max_users: editingPlan.max_users,
      max_supervisors: editingPlan.max_supervisors,
      has_asaas_integration: editingPlan.has_asaas_integration,
      has_chat: editingPlan.has_chat,
      has_whatsapp_groups: editingPlan.has_whatsapp_groups,
      has_campaigns: editingPlan.has_campaigns,
      has_chatbots: editingPlan.has_chatbots,
      has_scheduled_messages: editingPlan.has_scheduled_messages,
      price: editingPlan.price,
      billing_period: editingPlan.billing_period,
      is_active: editingPlan.is_active,
      visible_on_signup: editingPlan.visible_on_signup,
      trial_days: editingPlan.trial_days
    });

    if (updated) {
      toast.success('Plano atualizado!');
      setEditPlanDialogOpen(false);
      setEditingPlan(null);
      loadData();
    } else if (error) {
      toast.error(error);
    }
  };

  const handleDeletePlan = async (id: string) => {
    const success = await deletePlan(id);
    if (success) {
      toast.success('Plano removido!');
      loadData();
    } else if (error) {
      toast.error(error);
    }
  };

  // ============================================
  // ORGANIZATIONS HANDLERS
  // ============================================

  const handleCreateOrg = async () => {
    if (!newOrgName || !newOrgSlug || !newOrgOwner) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const org = await createOrganization({
      name: newOrgName,
      slug: newOrgSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      logo_url: newOrgLogo || undefined,
      owner_email: newOrgOwner,
      owner_name: newOrgOwnerName || undefined,
      owner_password: newOrgOwnerPassword || undefined,
      plan_id: newOrgPlan || undefined,
      expires_at: newOrgExpires?.toISOString()
    });

    if (org) {
      toast.success('Organização criada com sucesso!');
      setCreateOrgDialogOpen(false);
      setNewOrgName('');
      setNewOrgSlug('');
      setNewOrgLogo('');
      setNewOrgOwner('');
      setNewOrgOwnerName('');
      setNewOrgOwnerPassword('');
      setNewOrgPlan('');
      setNewOrgExpires(undefined);
      loadData();
    } else if (error) {
      toast.error(error);
    }
  };

  const handleUpdateOrg = async () => {
    if (!editingOrg) return;

    const updated = await updateOrganization(editingOrg.id, {
      name: editOrgName,
      logo_url: editOrgLogo || undefined,
      plan_id: editOrgPlan || undefined,
      expires_at: editOrgExpires?.toISOString()
    });

    if (updated) {
      toast.success('Organização atualizada!');
      setEditOrgDialogOpen(false);
      setEditingOrg(null);
      loadData();
    } else if (error) {
      toast.error(error);
    }
  };

  const handleDeleteOrg = async (id: string) => {
    const success = await deleteOrganization(id);
    if (success) {
      toast.success('Organização removida!');
      loadData();
    } else if (error) {
      toast.error(error);
    }
  };

  const openEditOrgDialog = (org: Organization) => {
    setEditingOrg(org);
    setEditOrgName(org.name);
    setEditOrgLogo(org.logo_url || '');
    setEditOrgPlan(org.plan_id || '');
    setEditOrgExpires(org.expires_at ? new Date(org.expires_at) : undefined);
    setEditOrgDialogOpen(true);
  };

  // ============================================
  // MEMBERS HANDLERS
  // ============================================

  const openMembersDialog = async (org: Organization) => {
    setSelectedOrg(org);
    setMembersDialogOpen(true);
    setLoadingMembers(true);
    const result = await getOrganizationMembers(org.id);
    setOrgMembers(result.members);
    setOrgLimits(result.limits);
    setLoadingMembers(false);
  };

  const reloadMembers = async () => {
    if (!selectedOrg) return;
    const result = await getOrganizationMembers(selectedOrg.id);
    setOrgMembers(result.members);
    setOrgLimits(result.limits);
  };

  const handleAddUser = async () => {
    if (!selectedOrg || !newUserEmail || !newUserName || !newUserPassword) {
      toast.error('Preencha todos os campos');
      return;
    }

    const user = await createOrganizationUser(selectedOrg.id, {
      email: newUserEmail,
      name: newUserName,
      password: newUserPassword,
      role: newUserRole
    });

    if (user) {
      toast.success('Usuário criado com sucesso!');
      setAddUserDialogOpen(false);
      setNewUserEmail('');
      setNewUserName('');
      setNewUserPassword('');
      setNewUserRole('agent');
      // Reload members
      await reloadMembers();
      loadData();
    } else if (error) {
      toast.error(error);
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    if (!selectedOrg) return;
    
    const success = await updateMemberRole(selectedOrg.id, memberId, newRole);
    if (success) {
      toast.success('Permissão atualizada!');
      await reloadMembers();
    } else if (error) {
      toast.error(error);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!selectedOrg) return;
    
    const success = await removeMember(selectedOrg.id, memberId);
    if (success) {
      toast.success('Membro removido!');
      await reloadMembers();
      loadData();
    } else if (error) {
      toast.error(error);
    }
  };

  const handleToggleSuperadmin = async (userId: string, currentValue: boolean) => {
    const success = await setSuperadmin(userId, !currentValue);
    if (success) {
      toast.success(!currentValue ? 'Superadmin ativado!' : 'Superadmin removido!');
      loadData();
    } else if (error) {
      toast.error(error);
    }
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'owner':
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Proprietário</Badge>;
      case 'admin':
        return <Badge className="bg-primary/20 text-primary border-primary/30">Admin</Badge>;
      case 'agent':
        return <Badge variant="secondary">Agente</Badge>;
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  if (!isSuperadmin) {
    return null;
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Shield className="h-8 w-8 text-primary neon-text" />
              Painel Superadmin
            </h1>
            <p className="text-muted-foreground">
              Gerencie planos, organizações e usuários do sistema
            </p>
          </div>
        </div>

        <Tabs defaultValue="plans" className="space-y-6">
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="plans" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Planos
            </TabsTrigger>
            <TabsTrigger value="organizations" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Organizações
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Usuários
            </TabsTrigger>
            <TabsTrigger value="branding" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Branding
            </TabsTrigger>
          </TabsList>

          {/* Plans Tab */}
          <TabsContent value="plans" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Planos</h2>
              <Dialog open={createPlanDialogOpen} onOpenChange={setCreatePlanDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="neon-glow">
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Plano
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Criar Plano</DialogTitle>
                    <DialogDescription>
                      Configure os limites e recursos do plano
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Nome *</Label>
                        <Input
                          placeholder="Plano Básico"
                          value={newPlanName}
                          onChange={(e) => setNewPlanName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Preço (R$)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="99.90"
                          value={newPlanPrice}
                          onChange={(e) => setNewPlanPrice(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Descrição</Label>
                      <Textarea
                        placeholder="Descrição do plano..."
                        value={newPlanDescription}
                        onChange={(e) => setNewPlanDescription(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1">
                          <Wifi className="h-3 w-3" />
                          Conexões
                        </Label>
                        <Input
                          type="number"
                          min="1"
                          value={newPlanConnections}
                          onChange={(e) => setNewPlanConnections(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          Msgs/mês
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          value={newPlanMessages}
                          onChange={(e) => setNewPlanMessages(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          Usuários
                        </Label>
                        <Input
                          type="number"
                          min="1"
                          value={newPlanUsers}
                          onChange={(e) => setNewPlanUsers(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1">
                          <Crown className="h-3 w-3" />
                          Supervisores
                        </Label>
                        <Input
                          type="number"
                          min="1"
                          value={newPlanSupervisors}
                          onChange={(e) => setNewPlanSupervisors(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Período</Label>
                      <Select value={newPlanPeriod} onValueChange={setNewPlanPeriod}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Mensal</SelectItem>
                          <SelectItem value="yearly">Anual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <Receipt className="h-4 w-4 text-muted-foreground" />
                          <Label htmlFor="asaas-switch">Integração Asaas</Label>
                        </div>
                        <Switch
                          id="asaas-switch"
                          checked={newPlanAsaas}
                          onCheckedChange={setNewPlanAsaas}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-muted-foreground" />
                          <Label htmlFor="chat-switch">Chat WhatsApp</Label>
                        </div>
                        <Switch
                          id="chat-switch"
                          checked={newPlanChat}
                          onCheckedChange={setNewPlanChat}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <Label htmlFor="groups-switch">Grupos WhatsApp</Label>
                        </div>
                        <Switch
                          id="groups-switch"
                          checked={newPlanGroups}
                          onCheckedChange={setNewPlanGroups}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-muted-foreground" />
                          <Label htmlFor="campaigns-switch">Campanhas/Disparo</Label>
                        </div>
                        <Switch
                          id="campaigns-switch"
                          checked={newPlanCampaigns}
                          onCheckedChange={setNewPlanCampaigns}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4 text-muted-foreground" />
                          <Label htmlFor="chatbots-switch">Chatbots</Label>
                        </div>
                        <Switch
                          id="chatbots-switch"
                          checked={newPlanChatbots}
                          onCheckedChange={setNewPlanChatbots}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <Label htmlFor="scheduled-switch">Agendamentos</Label>
                        </div>
                        <Switch
                          id="scheduled-switch"
                          checked={newPlanScheduled}
                          onCheckedChange={setNewPlanScheduled}
                        />
                      </div>
                    </div>
                    <div className="border-t pt-4 space-y-4">
                      <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-3">
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4 text-primary" />
                          <div>
                            <Label htmlFor="visible-switch">Visível no Cadastro</Label>
                            <p className="text-xs text-muted-foreground">Usuários podem escolher este plano ao se cadastrar</p>
                          </div>
                        </div>
                        <Switch
                          id="visible-switch"
                          checked={newPlanVisibleOnSignup}
                          onCheckedChange={setNewPlanVisibleOnSignup}
                        />
                      </div>
                      {newPlanVisibleOnSignup && (
                        <div className="space-y-2">
                          <Label>Dias de Teste Grátis</Label>
                          <Input
                            type="number"
                            min="1"
                            max="30"
                            value={newPlanTrialDays}
                            onChange={(e) => setNewPlanTrialDays(e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCreatePlanDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleCreatePlan} disabled={actionLoading}>
                      {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Criar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {loading ? (
                <div className="col-span-full flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : plans.length === 0 ? (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Nenhum plano cadastrado</p>
                </div>
              ) : (
                plans.map((plan) => (
                  <Card key={plan.id} className={cn(!plan.is_active && 'opacity-60')}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            {plan.name}
                            {!plan.is_active && <Badge variant="outline">Inativo</Badge>}
                            {plan.visible_on_signup && <Badge variant="default" className="text-xs">Cadastro ({plan.trial_days || 3}d)</Badge>}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            {plan.description || 'Sem descrição'}
                          </CardDescription>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-primary">
                            R$ {Number(plan.price).toFixed(2)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            /{plan.billing_period === 'monthly' ? 'mês' : 'ano'}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Wifi className="h-4 w-4 text-muted-foreground" />
                          <span>{plan.max_connections} conexões</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-muted-foreground" />
                          <span>{plan.max_monthly_messages.toLocaleString()} msgs</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>{plan.max_users} usuários</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Crown className="h-4 w-4 text-muted-foreground" />
                          <span>{plan.max_supervisors} supervisores</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {plan.has_chat && (
                          <Badge variant="secondary" className="text-xs">Chat</Badge>
                        )}
                        {plan.has_asaas_integration && (
                          <Badge variant="secondary" className="text-xs">Asaas</Badge>
                        )}
                        {plan.has_whatsapp_groups && (
                          <Badge variant="secondary" className="text-xs">Grupos</Badge>
                        )}
                        {plan.has_campaigns && (
                          <Badge variant="secondary" className="text-xs">Campanhas</Badge>
                        )}
                        {plan.has_chatbots && (
                          <Badge variant="secondary" className="text-xs">Chatbots</Badge>
                        )}
                        {plan.has_scheduled_messages && (
                          <Badge variant="secondary" className="text-xs">Agendamentos</Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-sm text-muted-foreground">
                          {plan.org_count || 0} organizações
                        </span>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingPlan({ ...plan });
                              setEditPlanDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Deletar plano?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação é irreversível. O plano "{plan.name}" será removido.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeletePlan(plan.id)}
                                  className="bg-destructive hover:bg-destructive/90"
                                >
                                  Deletar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Organizations Tab */}
          <TabsContent value="organizations" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Organizações</h2>
              <Dialog open={createOrgDialogOpen} onOpenChange={setCreateOrgDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="neon-glow">
                    <Plus className="h-4 w-4 mr-2" />
                    Nova Organização
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Criar Organização</DialogTitle>
                    <DialogDescription>
                      Crie uma nova organização e defina o proprietário
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Nome da Empresa *</Label>
                        <Input
                          placeholder="Empresa XYZ"
                          value={newOrgName}
                          onChange={(e) => {
                            setNewOrgName(e.target.value);
                            setNewOrgSlug(generateSlug(e.target.value));
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Slug (URL) *</Label>
                        <Input
                          placeholder="empresa-xyz"
                          value={newOrgSlug}
                          onChange={(e) => setNewOrgSlug(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Email do Proprietário *</Label>
                      <Input
                        type="email"
                        placeholder="proprietario@email.com"
                        value={newOrgOwner}
                        onChange={(e) => setNewOrgOwner(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Se o usuário não existir, preencha nome e senha abaixo para criá-lo.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Nome do Proprietário</Label>
                        <Input
                          placeholder="João Silva"
                          value={newOrgOwnerName}
                          onChange={(e) => setNewOrgOwnerName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Senha (novo usuário)</Label>
                        <Input
                          type="password"
                          placeholder="••••••••"
                          value={newOrgOwnerPassword}
                          onChange={(e) => setNewOrgOwnerPassword(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Plano</Label>
                        <Select value={newOrgPlan} onValueChange={setNewOrgPlan}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um plano" />
                          </SelectTrigger>
                          <SelectContent>
                            {plans.filter(p => p.is_active).length === 0 ? (
                              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                                Nenhum plano ativo. Crie planos na aba "Planos".
                              </div>
                            ) : (
                              plans.filter(p => p.is_active).map(plan => (
                                <SelectItem key={plan.id} value={plan.id}>
                                  {plan.name} - R$ {Number(plan.price).toFixed(2)}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Vencimento</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !newOrgExpires && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {newOrgExpires ? format(newOrgExpires, "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={newOrgExpires}
                              onSelect={setNewOrgExpires}
                              initialFocus
                              className="p-3 pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Image className="h-4 w-4" />
                        URL do Logo (opcional)
                      </Label>
                      <Input
                        placeholder="https://example.com/logo.png"
                        value={newOrgLogo}
                        onChange={(e) => setNewOrgLogo(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCreateOrgDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleCreateOrg} disabled={actionLoading}>
                      {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Criar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : organizations.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>Nenhuma organização cadastrada</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Logo</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Plano</TableHead>
                        <TableHead>Membros</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead className="w-[140px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {organizations.map((org) => (
                        <TableRow key={org.id}>
                          <TableCell>
                            {org.logo_url ? (
                              <img 
                                src={org.logo_url} 
                                alt={org.name}
                                className="h-10 w-10 rounded-lg object-cover border border-border"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Building2 className="h-5 w-5 text-primary" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{org.name}</div>
                              <div className="text-xs text-muted-foreground">/{org.slug}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {org.plan_name ? (
                              <Badge variant="secondary">
                                {org.plan_name}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{org.member_count || 0}</Badge>
                          </TableCell>
                          <TableCell>
                            {org.expires_at ? (
                              <Badge variant={isExpired(org.expires_at) ? "destructive" : "secondary"}>
                                {format(new Date(org.expires_at), "dd/MM/yyyy", { locale: ptBR })}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => openMembersDialog(org)}
                                title="Gerenciar usuários"
                              >
                                <Users className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => openEditOrgDialog(org)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Deletar organização?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta ação é irreversível. A organização "{org.name}" e todos os dados serão removidos.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteOrg(org.id)}
                                      className="bg-destructive hover:bg-destructive/90"
                                    >
                                      Deletar
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4">
            <h2 className="text-xl font-semibold">Todos os Usuários</h2>
            
            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : users.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>Nenhum usuário cadastrado</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Superadmin</TableHead>
                        <TableHead>Cadastrado em</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{user.name}</span>
                              {user.is_superadmin && (
                                <Crown className="h-4 w-4 text-amber-500" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{user.email}</TableCell>
                          <TableCell>
                            <Switch
                              checked={user.is_superadmin}
                              onCheckedChange={() => handleToggleSuperadmin(user.id, user.is_superadmin)}
                            />
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(user.created_at).toLocaleDateString('pt-BR')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Branding Tab */}
          <BrandingTab />
        </Tabs>
      </div>

      {/* Edit Organization Dialog */}
      <Dialog open={editOrgDialogOpen} onOpenChange={setEditOrgDialogOpen}>
        <DialogContent className="sm:max-w-lg">
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plano</Label>
                <Select value={editOrgPlan} onValueChange={setEditOrgPlan}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map(plan => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Vencimento</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !editOrgExpires && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editOrgExpires ? format(editOrgExpires, "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={editOrgExpires}
                      onSelect={setEditOrgExpires}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="space-y-2">
              <Label>URL do Logo</Label>
              <Input
                value={editOrgLogo}
                onChange={(e) => setEditOrgLogo(e.target.value)}
                placeholder="https://example.com/logo.png"
              />
              {editOrgLogo && (
                <div className="mt-2 flex justify-center">
                  <img 
                    src={editOrgLogo} 
                    alt="Preview" 
                    className="h-16 w-16 rounded-lg object-cover border border-border"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOrgDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateOrg} disabled={actionLoading}>
              {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Plan Dialog */}
      <Dialog open={editPlanDialogOpen} onOpenChange={setEditPlanDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Plano</DialogTitle>
          </DialogHeader>
          {editingPlan && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={editingPlan.name}
                    onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Preço (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingPlan.price}
                    onChange={(e) => setEditingPlan({ ...editingPlan, price: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  value={editingPlan.description || ''}
                  onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Conexões</Label>
                  <Input
                    type="number"
                    min="1"
                    value={editingPlan.max_connections}
                    onChange={(e) => setEditingPlan({ ...editingPlan, max_connections: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Msgs/mês</Label>
                  <Input
                    type="number"
                    min="0"
                    value={editingPlan.max_monthly_messages}
                    onChange={(e) => setEditingPlan({ ...editingPlan, max_monthly_messages: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Usuários</Label>
                  <Input
                    type="number"
                    min="1"
                    value={editingPlan.max_users}
                    onChange={(e) => setEditingPlan({ ...editingPlan, max_users: parseInt(e.target.value) || 5 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Supervisores</Label>
                  <Input
                    type="number"
                    min="1"
                    value={editingPlan.max_supervisors}
                    onChange={(e) => setEditingPlan({ ...editingPlan, max_supervisors: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Período</Label>
                <Select 
                  value={editingPlan.billing_period} 
                  onValueChange={(v) => setEditingPlan({ ...editingPlan, billing_period: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="yearly">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-4 pt-2">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label htmlFor="edit-asaas">Asaas</Label>
                  <Switch
                    id="edit-asaas"
                    checked={editingPlan.has_asaas_integration}
                    onCheckedChange={(v) => setEditingPlan({ ...editingPlan, has_asaas_integration: v })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label htmlFor="edit-chat">Chat</Label>
                  <Switch
                    id="edit-chat"
                    checked={editingPlan.has_chat}
                    onCheckedChange={(v) => setEditingPlan({ ...editingPlan, has_chat: v })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label htmlFor="edit-groups">Grupos</Label>
                  <Switch
                    id="edit-groups"
                    checked={editingPlan.has_whatsapp_groups}
                    onCheckedChange={(v) => setEditingPlan({ ...editingPlan, has_whatsapp_groups: v })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label htmlFor="edit-campaigns">Campanhas</Label>
                  <Switch
                    id="edit-campaigns"
                    checked={editingPlan.has_campaigns}
                    onCheckedChange={(v) => setEditingPlan({ ...editingPlan, has_campaigns: v })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label htmlFor="edit-chatbots">Chatbots</Label>
                  <Switch
                    id="edit-chatbots"
                    checked={editingPlan.has_chatbots}
                    onCheckedChange={(v) => setEditingPlan({ ...editingPlan, has_chatbots: v })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label htmlFor="edit-scheduled">Agendamentos</Label>
                  <Switch
                    id="edit-scheduled"
                    checked={editingPlan.has_scheduled_messages}
                    onCheckedChange={(v) => setEditingPlan({ ...editingPlan, has_scheduled_messages: v })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label htmlFor="edit-active">Ativo</Label>
                  <Switch
                    id="edit-active"
                    checked={editingPlan.is_active}
                    onCheckedChange={(v) => setEditingPlan({ ...editingPlan, is_active: v })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <div>
                    <Label htmlFor="edit-visible">Visível no Cadastro</Label>
                    <p className="text-xs text-muted-foreground">Usuários podem escolher este plano</p>
                  </div>
                  <Switch
                    id="edit-visible"
                    checked={editingPlan.visible_on_signup}
                    onCheckedChange={(v) => setEditingPlan({ ...editingPlan, visible_on_signup: v })}
                  />
                </div>
                {editingPlan.visible_on_signup && (
                  <div className="space-y-2">
                    <Label>Dias de Teste Grátis</Label>
                    <Input
                      type="number"
                      min="1"
                      max="30"
                      value={editingPlan.trial_days || 3}
                      onChange={(e) => setEditingPlan({ ...editingPlan, trial_days: parseInt(e.target.value) || 3 })}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPlanDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdatePlan} disabled={actionLoading}>
              {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Organization Members Dialog */}
      <Dialog open={membersDialogOpen} onOpenChange={setMembersDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Usuários - {selectedOrg?.name}
            </DialogTitle>
            <DialogDescription>
              Gerencie os usuários e permissões desta organização
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            {/* Limits info */}
            {orgLimits && (
              <div className="grid grid-cols-2 gap-3 mb-4 p-3 rounded-lg bg-muted/50 border">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Usuários
                  </span>
                  <Badge variant={orgLimits.current_users >= orgLimits.max_users ? 'destructive' : 'secondary'}>
                    {orgLimits.current_users}/{orgLimits.max_users}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Crown className="h-4 w-4" />
                    Supervisores
                  </span>
                  <Badge variant={orgLimits.current_supervisors >= orgLimits.max_supervisors ? 'destructive' : 'secondary'}>
                    {orgLimits.current_supervisors}/{orgLimits.max_supervisors}
                  </Badge>
                </div>
              </div>
            )}
            
            <div className="flex justify-end mb-4">
              <Dialog open={addUserDialogOpen} onOpenChange={setAddUserDialogOpen}>
                <DialogTrigger asChild>
                  <Button 
                    size="sm"
                    disabled={orgLimits && orgLimits.current_users >= orgLimits.max_users}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Adicionar Usuário
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Adicionar Usuário</DialogTitle>
                    <DialogDescription>
                      Crie um novo usuário para esta organização
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Nome *</Label>
                      <Input
                        placeholder="Nome completo"
                        value={newUserName}
                        onChange={(e) => setNewUserName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email *</Label>
                      <Input
                        type="email"
                        placeholder="usuario@email.com"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Senha *</Label>
                      <Input
                        type="password"
                        placeholder="Senha segura"
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Permissão</Label>
                      <Select value={newUserRole} onValueChange={setNewUserRole}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">Proprietário</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="agent">Agente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAddUserDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleAddUser} disabled={actionLoading}>
                      {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Criar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {loadingMembers ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : orgMembers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>Nenhum usuário nesta organização</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Permissão</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgMembers.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.name}</TableCell>
                      <TableCell className="text-muted-foreground">{member.email}</TableCell>
                      <TableCell>
                        <Select
                          value={member.role}
                          onValueChange={(value) => handleUpdateRole(member.id, value)}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="owner">Proprietário</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="agent">Agente</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
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
                                {member.name} será removido desta organização.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleRemoveMember(member.id)}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                Remover
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}