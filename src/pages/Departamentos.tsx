import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Users, Plus, Edit, Trash2, UserPlus, UserMinus,
  Clock, MessageSquare, Settings, Loader2, Phone
} from "lucide-react";
import { toast } from "sonner";
import { useDepartments, Department, DepartmentMember } from "@/hooks/use-departments";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";

interface OrgUser {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: string;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
];

const COLOR_OPTIONS = [
  '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e',
  '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6b7280'
];

const Departamentos = () => {
  const { 
    getDepartments, 
    createDepartment, 
    updateDepartment, 
    deleteDepartment,
    getMembers,
    addMember,
    removeMember,
    loading,
    error,
  } = useDepartments();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  
  // Dialog states
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [membersDepartment, setMembersDepartment] = useState<Department | null>(null);
  const [members, setMembers] = useState<DepartmentMember[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [addingMembers, setAddingMembers] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [departmentToDelete, setDepartmentToDelete] = useState<Department | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#6366f1',
    max_concurrent_chats: 5,
    auto_assign: false,
    business_hours_enabled: false,
    business_hours_start: '08:00',
    business_hours_end: '18:00',
    business_days: [1, 2, 3, 4, 5] as number[],
    welcome_message: '',
    offline_message: '',
    queue_message: 'Você está na fila de espera. Em breve um atendente irá te atender.',
  });

  const [saving, setSaving] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const loadDepartments = async () => {
    const data = await getDepartments();
    setDepartments(data);
  };

  const loadOrgUsers = async () => {
    try {
      const data = await api<OrgUser[]>('/api/chatbots/org/users', { auth: true });
      setOrgUsers(data);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    }
  };

  useEffect(() => {
    loadDepartments();
    loadOrgUsers();
  }, []);

  const handleCreate = () => {
    setSelectedDepartment(null);
    setFormData({
      name: '',
      description: '',
      color: '#6366f1',
      max_concurrent_chats: 5,
      auto_assign: false,
      business_hours_enabled: false,
      business_hours_start: '08:00',
      business_hours_end: '18:00',
      business_days: [1, 2, 3, 4, 5],
      welcome_message: '',
      offline_message: '',
      queue_message: 'Você está na fila de espera. Em breve um atendente irá te atender.',
    });
    setEditorOpen(true);
  };

  const handleEdit = (dept: Department) => {
    setSelectedDepartment(dept);
    setFormData({
      name: dept.name,
      description: dept.description || '',
      color: dept.color,
      max_concurrent_chats: dept.max_concurrent_chats,
      auto_assign: dept.auto_assign,
      business_hours_enabled: dept.business_hours_enabled,
      business_hours_start: dept.business_hours_start,
      business_hours_end: dept.business_hours_end,
      business_days: dept.business_days,
      welcome_message: dept.welcome_message || '',
      offline_message: dept.offline_message || '',
      queue_message: dept.queue_message,
    });
    setEditorOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    setSaving(true);
    try {
      if (selectedDepartment) {
        const result = await updateDepartment(selectedDepartment.id, formData);
        if (result) {
          toast.success('Departamento atualizado!');
          loadDepartments();
          setEditorOpen(false);
        } else {
          toast.error(error || 'Não foi possível atualizar o departamento');
        }
      } else {
        const result = await createDepartment(formData);
        if (result) {
          toast.success('Departamento criado!');
          loadDepartments();
          setEditorOpen(false);
        } else {
          toast.error(error || 'Não foi possível criar o departamento');
        }
      }
    } catch (e: any) {
      toast.error(e?.message || error || 'Erro ao salvar departamento');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (dept: Department) => {
    setDepartmentToDelete(dept);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!departmentToDelete) return;
    
    const success = await deleteDepartment(departmentToDelete.id);
    if (success) {
      toast.success('Departamento excluído');
      loadDepartments();
    }
    setDeleteDialogOpen(false);
    setDepartmentToDelete(null);
  };

  const handleManageMembers = async (dept: Department) => {
    setMembersDepartment(dept);
    setLoadingMembers(true);
    setMembersOpen(true);
    setSelectedUserIds([]);
    
    const data = await getMembers(dept.id);
    setMembers(data);
    setLoadingMembers(false);
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleAddSelectedMembers = async () => {
    if (!membersDepartment || selectedUserIds.length === 0) return;
    
    setAddingMembers(true);
    let addedCount = 0;
    
    for (const userId of selectedUserIds) {
      const result = await addMember(membersDepartment.id, userId);
      if (result) {
        setMembers(prev => [...prev, result]);
        addedCount++;
      }
    }
    
    if (addedCount > 0) {
      toast.success(`${addedCount} membro(s) adicionado(s)`);
      loadDepartments();
    }
    
    setSelectedUserIds([]);
    setAddingMembers(false);
  };

  const handleRemoveMember = async (userId: string) => {
    if (!membersDepartment) return;
    
    const success = await removeMember(membersDepartment.id, userId);
    if (success) {
      setMembers(prev => prev.filter(m => m.user_id !== userId));
      toast.success('Membro removido');
      loadDepartments();
    }
  };

  const toggleDay = (day: number) => {
    setFormData(prev => ({
      ...prev,
      business_days: prev.business_days.includes(day)
        ? prev.business_days.filter(d => d !== day)
        : [...prev.business_days, day].sort()
    }));
  };

  const availableUsers = orgUsers.filter(
    u => !members.some(m => m.user_id === u.id)
  );

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <Users className="h-8 w-8 text-primary" />
              Departamentos
            </h1>
            <p className="mt-1 text-muted-foreground">
              Gerencie filas de atendimento e distribua conversas entre equipes
            </p>
          </div>
          <Button onClick={handleCreate} variant="gradient">
            <Plus className="h-4 w-4 mr-2" />
            Novo Departamento
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-primary/10">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{departments.length}</p>
                  <p className="text-sm text-muted-foreground">Departamentos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-green-500/10">
                  <Users className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {departments.reduce((acc, d) => acc + (d.available_count || 0), 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">Agentes Disponíveis</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-amber-500/10">
                  <Clock className="h-6 w-6 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {departments.reduce((acc, d) => acc + (d.pending_chats || 0), 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">Na Fila</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-blue-500/10">
                  <MessageSquare className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {departments.reduce((acc, d) => acc + (d.active_chats || 0), 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">Em Atendimento</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Department List */}
        {departments.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Nenhum departamento</h3>
              <p className="text-muted-foreground mb-4">
                Crie departamentos para organizar as filas de atendimento
              </p>
              <Button onClick={handleCreate} variant="gradient">
                <Plus className="h-4 w-4 mr-2" />
                Criar Departamento
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {departments.map((dept) => (
              <Card key={dept.id} className="relative overflow-hidden">
                <div 
                  className="absolute top-0 left-0 right-0 h-1"
                  style={{ backgroundColor: dept.color }}
                />
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className="p-2 rounded-full"
                        style={{ backgroundColor: `${dept.color}20` }}
                      >
                        <Users className="h-5 w-5" style={{ color: dept.color }} />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{dept.name}</CardTitle>
                        {dept.description && (
                          <CardDescription className="line-clamp-1">
                            {dept.description}
                          </CardDescription>
                        )}
                      </div>
                    </div>
                    <Badge variant={dept.is_active ? "default" : "secondary"}>
                      {dept.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded-lg bg-muted">
                      <p className="text-lg font-bold">{dept.member_count || 0}</p>
                      <p className="text-xs text-muted-foreground">Membros</p>
                    </div>
                    <div className="p-2 rounded-lg bg-muted">
                      <p className="text-lg font-bold">{dept.available_count || 0}</p>
                      <p className="text-xs text-muted-foreground">Disponíveis</p>
                    </div>
                    <div className="p-2 rounded-lg bg-muted">
                      <p className="text-lg font-bold">{dept.active_chats || 0}</p>
                      <p className="text-xs text-muted-foreground">Ativos</p>
                    </div>
                  </div>

                  {dept.business_hours_enabled && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      {dept.business_hours_start} - {dept.business_hours_end}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => handleManageMembers(dept)}
                    >
                      <UserPlus className="h-4 w-4 mr-1" />
                      Membros
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleEdit(dept)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteClick(dept)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              {selectedDepartment ? 'Editar Departamento' : 'Novo Departamento'}
            </DialogTitle>
            <DialogDescription>
              Configure o departamento e suas regras de atendimento
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Comercial"
                />
              </div>
              <div className="space-y-2">
                <Label>Cor</Label>
                <div className="flex gap-1 flex-wrap">
                  {COLOR_OPTIONS.map(color => (
                    <button
                      key={color}
                      type="button"
                      className={`w-6 h-6 rounded-full border-2 transition-transform ${
                        formData.color === color ? 'scale-125 border-foreground' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setFormData(prev => ({ ...prev, color }))}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Descreva o propósito deste departamento..."
                rows={2}
              />
            </div>

            {/* Settings */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Configurações
              </h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Máx. atendimentos por agente</Label>
                  <Input
                    type="number"
                    value={formData.max_concurrent_chats}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      max_concurrent_chats: parseInt(e.target.value) || 5 
                    }))}
                    min={1}
                    max={20}
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <Label>Atribuição automática</Label>
                    <p className="text-xs text-muted-foreground">
                      Distribuir chats automaticamente
                    </p>
                  </div>
                  <Switch
                    checked={formData.auto_assign}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, auto_assign: checked }))}
                  />
                </div>
              </div>
            </div>

            {/* Business Hours */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Horário de Funcionamento
                </h4>
                <Switch
                  checked={formData.business_hours_enabled}
                  onCheckedChange={(checked) => setFormData(prev => ({ 
                    ...prev, 
                    business_hours_enabled: checked 
                  }))}
                />
              </div>

              {formData.business_hours_enabled && (
                <div className="space-y-4 pl-4 border-l-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Início</Label>
                      <Input
                        type="time"
                        value={formData.business_hours_start}
                        onChange={(e) => setFormData(prev => ({ 
                          ...prev, 
                          business_hours_start: e.target.value 
                        }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Fim</Label>
                      <Input
                        type="time"
                        value={formData.business_hours_end}
                        onChange={(e) => setFormData(prev => ({ 
                          ...prev, 
                          business_hours_end: e.target.value 
                        }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Dias</Label>
                    <div className="flex gap-1">
                      {DAYS_OF_WEEK.map((day) => (
                        <Button
                          key={day.value}
                          type="button"
                          variant={formData.business_days.includes(day.value) ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleDay(day.value)}
                        >
                          {day.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Mensagens Automáticas
              </h4>
              
              <div className="space-y-2">
                <Label>Mensagem de boas-vindas</Label>
                <Textarea
                  value={formData.welcome_message}
                  onChange={(e) => setFormData(prev => ({ ...prev, welcome_message: e.target.value }))}
                  placeholder="Olá! Você foi direcionado para o setor comercial..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Mensagem de fila de espera</Label>
                <Textarea
                  value={formData.queue_message}
                  onChange={(e) => setFormData(prev => ({ ...prev, queue_message: e.target.value }))}
                  placeholder="Você está na fila de espera..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Mensagem fora do horário</Label>
                <Textarea
                  value={formData.offline_message}
                  onChange={(e) => setFormData(prev => ({ ...prev, offline_message: e.target.value }))}
                  placeholder="No momento estamos fora do horário de atendimento..."
                  rows={2}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} variant="gradient">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Members Dialog */}
      <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Membros - {membersDepartment?.name}
            </DialogTitle>
            <DialogDescription>
              Gerencie os agentes deste departamento
            </DialogDescription>
          </DialogHeader>

          {loadingMembers ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Add Members */}
              {availableUsers.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Adicionar membros</Label>
                    {selectedUserIds.length > 0 && (
                      <Button 
                        size="sm" 
                        onClick={handleAddSelectedMembers}
                        disabled={addingMembers}
                        variant="gradient"
                      >
                        {addingMembers ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <UserPlus className="h-4 w-4 mr-1" />
                        )}
                        Adicionar ({selectedUserIds.length})
                      </Button>
                    )}
                  </div>
                  <ScrollArea className="h-[150px] border rounded-lg p-2">
                    <div className="space-y-1">
                      {availableUsers.map(user => (
                        <div 
                          key={user.id}
                          className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                          onClick={() => toggleUserSelection(user.id)}
                        >
                          <Checkbox 
                            checked={selectedUserIds.includes(user.id)}
                            onCheckedChange={() => toggleUserSelection(user.id)}
                          />
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={user.avatar_url || undefined} />
                            <AvatarFallback>{user.name?.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{user.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Member List */}
              <div className="space-y-2">
                <Label>Membros atuais ({members.length})</Label>
                <ScrollArea className="h-[300px]">
                  {members.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Nenhum membro neste departamento</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {members.map(member => (
                        <div 
                          key={member.id}
                          className="flex items-center justify-between p-3 rounded-lg border"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarImage src={member.avatar_url || undefined} />
                              <AvatarFallback>{member.user_name?.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{member.user_name}</p>
                              <p className="text-xs text-muted-foreground">{member.user_email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={member.is_available ? "default" : "secondary"}>
                              {member.is_available ? 'Disponível' : 'Indisponível'}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleRemoveMember(member.user_id)}
                            >
                              <UserMinus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir departamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o departamento "{departmentToDelete?.name}"?
              Esta ação não pode ser desfeita. As conversas associadas perderão a referência ao departamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
};

export default Departamentos;
