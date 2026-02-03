import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Search,
  MoreVertical,
  Edit2,
  Trash2,
  Users,
  Play,
  Pause,
  MessageSquare,
  Mail,
  Clock,
  Loader2,
  ArrowRight,
  Zap,
  Target,
  TrendingUp,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  useNurturingSequences,
  useNurturingSequence,
  useSequenceEnrollments,
  useSequenceStats,
  useNurturingMutations,
  NurturingSequence,
  NurturingStep,
  NurturingEnrollment,
} from "@/hooks/use-nurturing";

export default function SequenciasNurturing() {
  const { modulesEnabled } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedSequence, setSelectedSequence] = useState<NurturingSequence | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [sequenceToDelete, setSequenceToDelete] = useState<NurturingSequence | null>(null);

  const { data: sequences, isLoading } = useNurturingSequences();
  const { data: sequenceDetail, isLoading: loadingDetail } = useNurturingSequence(
    selectedSequence?.id || null
  );
  const { data: enrollments } = useSequenceEnrollments(selectedSequence?.id || null);
  const { data: stats } = useSequenceStats(selectedSequence?.id || null);
  const {
    createSequence,
    updateSequence,
    deleteSequence,
    addStep,
    deleteStep,
    pauseEnrollment,
    resumeEnrollment,
    removeEnrollment,
  } = useNurturingMutations();

  const filteredSequences = (sequences || []).filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggleActive = (sequence: NurturingSequence) => {
    updateSequence.mutate({
      id: sequence.id,
      is_active: !sequence.is_active,
    });
  };

  const handleDeleteConfirm = () => {
    if (sequenceToDelete) {
      deleteSequence.mutate(sequenceToDelete.id, {
        onSuccess: () => {
          setSequenceToDelete(null);
          setShowDeleteDialog(false);
          if (selectedSequence?.id === sequenceToDelete.id) {
            setSelectedSequence(null);
          }
        },
      });
    }
  };

  return (
    <MainLayout>
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Sidebar - Sequences list */}
        <div className="w-80 border-r flex flex-col">
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Sequências</h2>
              <Button size="sm" onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Nova
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar sequência..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredSequences.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhuma sequência</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredSequences.map((sequence) => (
                  <div
                    key={sequence.id}
                    onClick={() => setSelectedSequence(sequence)}
                    className={cn(
                      "p-3 rounded-lg cursor-pointer transition-colors",
                      selectedSequence?.id === sequence.id
                        ? "bg-primary/10 border border-primary/30"
                        : "hover:bg-muted"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {sequence.name}
                          </span>
                          {sequence.is_active ? (
                            <Badge variant="outline" className="text-[10px] h-5 bg-green-100 text-green-700 border-green-300">
                              Ativo
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] h-5">
                              Inativo
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {sequence.description || "Sem descrição"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {sequence.contacts_enrolled}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {sequence.steps_count || 0} passos
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Main content - Sequence detail */}
        <div className="flex-1 flex flex-col">
          {selectedSequence ? (
            <>
              {/* Header */}
              <div className="p-4 border-b flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-xl font-semibold">{selectedSequence.name}</h1>
                    <Switch
                      checked={selectedSequence.is_active}
                      onCheckedChange={() => handleToggleActive(selectedSequence)}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedSequence.description}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setShowCreateDialog(true)}>
                      <Edit2 className="h-4 w-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        setSequenceToDelete(selectedSequence);
                        setShowDeleteDialog(true);
                      }}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Stats */}
              {stats && (
                <div className="grid grid-cols-5 gap-4 p-4 border-b bg-muted/30">
                  <Card className="p-3">
                    <div className="text-2xl font-bold">{stats.enrollments.total}</div>
                    <div className="text-xs text-muted-foreground">Total Inscritos</div>
                  </Card>
                  <Card className="p-3">
                    <div className="text-2xl font-bold text-green-600">{stats.enrollments.active}</div>
                    <div className="text-xs text-muted-foreground">Ativos</div>
                  </Card>
                  <Card className="p-3">
                    <div className="text-2xl font-bold text-amber-600">{stats.enrollments.paused}</div>
                    <div className="text-xs text-muted-foreground">Pausados</div>
                  </Card>
                  <Card className="p-3">
                    <div className="text-2xl font-bold text-blue-600">{stats.enrollments.completed}</div>
                    <div className="text-xs text-muted-foreground">Concluídos</div>
                  </Card>
                  <Card className="p-3">
                    <div className="text-2xl font-bold text-primary">{stats.enrollments.converted}</div>
                    <div className="text-xs text-muted-foreground">Convertidos</div>
                  </Card>
                </div>
              )}

              {/* Tabs */}
              <Tabs defaultValue="steps" className="flex-1 flex flex-col">
                <TabsList className="mx-4 mt-4 w-fit">
                  <TabsTrigger value="steps">Passos</TabsTrigger>
                  <TabsTrigger value="enrollments">
                    Inscritos
                    {enrollments && enrollments.length > 0 && (
                      <Badge variant="secondary" className="ml-2 text-[10px]">
                        {enrollments.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="settings">Configurações</TabsTrigger>
                </TabsList>

                {/* Steps Tab */}
                <TabsContent value="steps" className="flex-1 p-4 overflow-auto">
                  <div className="space-y-4">
                    {loadingDetail ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : (
                      <>
                        {/* Steps Timeline */}
                        <div className="relative">
                          {(sequenceDetail?.steps || []).map((step, idx) => (
                            <div key={step.id} className="flex gap-4 mb-4">
                              {/* Timeline line */}
                              <div className="flex flex-col items-center">
                                <div className={cn(
                                  "w-10 h-10 rounded-full flex items-center justify-center border-2",
                                  step.channel === 'whatsapp'
                                    ? "bg-green-100 border-green-500 text-green-700"
                                    : "bg-blue-100 border-blue-500 text-blue-700"
                                )}>
                                  {step.channel === 'whatsapp' ? (
                                    <MessageSquare className="h-5 w-5" />
                                  ) : (
                                    <Mail className="h-5 w-5" />
                                  )}
                                </div>
                                {idx < (sequenceDetail?.steps?.length || 0) - 1 && (
                                  <div className="w-0.5 h-full bg-border flex-1 min-h-[20px]" />
                                )}
                              </div>

                              {/* Step content */}
                              <Card className="flex-1">
                                <CardHeader className="pb-2">
                                  <div className="flex items-center justify-between">
                                    <CardTitle className="text-base flex items-center gap-2">
                                      Passo {step.step_order}
                                      <Badge variant="outline" className="text-[10px]">
                                        {step.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}
                                      </Badge>
                                    </CardTitle>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <Clock className="h-3 w-3" />
                                      Após {step.delay_value} {
                                        step.delay_unit === 'minutes' ? 'min' :
                                        step.delay_unit === 'hours' ? 'h' : 'd'
                                      }
                                    </div>
                                  </div>
                                </CardHeader>
                                <CardContent>
                                  {step.channel === 'whatsapp' ? (
                                    <div className="text-sm bg-muted/50 p-3 rounded-lg">
                                      {step.whatsapp_content || 'Sem conteúdo'}
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      <div className="text-sm font-medium">{step.email_subject}</div>
                                      <div className="text-xs text-muted-foreground line-clamp-2">
                                        {step.email_body?.replace(/<[^>]*>/g, '') || 'Sem conteúdo'}
                                      </div>
                                    </div>
                                  )}
                                  
                                  {/* Stats */}
                                  <div className="flex items-center gap-4 mt-3 pt-3 border-t text-xs">
                                    <span className="text-muted-foreground">
                                      Enviados: <strong>{step.sent_count}</strong>
                                    </span>
                                    <span className="text-muted-foreground">
                                      Abertos: <strong>{step.opened_count}</strong>
                                    </span>
                                    <span className="text-muted-foreground">
                                      Respondidos: <strong>{step.replied_count}</strong>
                                    </span>
                                  </div>
                                </CardContent>
                              </Card>
                            </div>
                          ))}

                          {/* Add step button */}
                          <Button
                            variant="outline"
                            className="ml-14"
                            onClick={() => {
                              // TODO: Open add step dialog
                            }}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Adicionar Passo
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </TabsContent>

                {/* Enrollments Tab */}
                <TabsContent value="enrollments" className="flex-1 p-4 overflow-auto">
                  <div className="space-y-2">
                    {(enrollments || []).map((enrollment) => (
                      <Card key={enrollment.id} className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                              <Users className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div>
                              <div className="font-medium">
                                {enrollment.contact_name || enrollment.contact_phone || enrollment.contact_email}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Passo {enrollment.current_step + 1} • 
                                Inscrito em {format(new Date(enrollment.enrolled_at), "dd/MM/yyyy", { locale: ptBR })}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px]",
                                enrollment.status === 'active' && "bg-green-100 text-green-700",
                                enrollment.status === 'paused' && "bg-amber-100 text-amber-700",
                                enrollment.status === 'completed' && "bg-blue-100 text-blue-700",
                                enrollment.status === 'converted' && "bg-primary/20 text-primary"
                              )}
                            >
                              {enrollment.status === 'active' && 'Ativo'}
                              {enrollment.status === 'paused' && 'Pausado'}
                              {enrollment.status === 'completed' && 'Concluído'}
                              {enrollment.status === 'exited' && 'Saiu'}
                              {enrollment.status === 'converted' && 'Convertido'}
                            </Badge>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {enrollment.status === 'active' && (
                                  <DropdownMenuItem
                                    onClick={() => pauseEnrollment.mutate({
                                      enrollmentId: enrollment.id,
                                      sequenceId: selectedSequence.id,
                                      reason: 'manual'
                                    })}
                                  >
                                    <Pause className="h-4 w-4 mr-2" />
                                    Pausar
                                  </DropdownMenuItem>
                                )}
                                {enrollment.status === 'paused' && (
                                  <DropdownMenuItem
                                    onClick={() => resumeEnrollment.mutate({
                                      enrollmentId: enrollment.id,
                                      sequenceId: selectedSequence.id
                                    })}
                                  >
                                    <Play className="h-4 w-4 mr-2" />
                                    Retomar
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => removeEnrollment.mutate({
                                    enrollmentId: enrollment.id,
                                    sequenceId: selectedSequence.id
                                  })}
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Remover
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </Card>
                    ))}

                    {(!enrollments || enrollments.length === 0) && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Nenhum contato inscrito</p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Settings Tab */}
                <TabsContent value="settings" className="flex-1 p-4 overflow-auto">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Comportamento da Sequência</CardTitle>
                      <CardDescription>
                        Configure como a sequência reage a interações do contato
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Pausar ao responder</Label>
                          <p className="text-xs text-muted-foreground">
                            Pausa a sequência quando o contato envia uma mensagem
                          </p>
                        </div>
                        <Switch
                          checked={sequenceDetail?.pause_on_reply ?? true}
                          onCheckedChange={(checked) => {
                            updateSequence.mutate({
                              id: selectedSequence.id,
                              pause_on_reply: checked
                            });
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Pausar ao ganhar negócio</Label>
                          <p className="text-xs text-muted-foreground">
                            Pausa quando a negociação vinculada é marcada como ganha
                          </p>
                        </div>
                        <Switch
                          checked={sequenceDetail?.pause_on_deal_won ?? true}
                          onCheckedChange={(checked) => {
                            updateSequence.mutate({
                              id: selectedSequence.id,
                              pause_on_deal_won: checked
                            });
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Sair da sequência ao responder</Label>
                          <p className="text-xs text-muted-foreground">
                            Remove o contato da sequência ao invés de apenas pausar
                          </p>
                        </div>
                        <Switch
                          checked={sequenceDetail?.exit_on_reply ?? false}
                          onCheckedChange={(checked) => {
                            updateSequence.mutate({
                              id: selectedSequence.id,
                              exit_on_reply: checked
                            });
                          }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Zap className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">Selecione uma sequência</p>
                <p className="text-sm">ou crie uma nova para começar</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <CreateSequenceDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={() => setShowCreateDialog(false)}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir sequência?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os passos e inscrições serão removidos.
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
}

// Create Sequence Dialog Component
function CreateSequenceDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pauseOnReply, setPauseOnReply] = useState(true);
  const { createSequence } = useNurturingMutations();

  const handleSubmit = () => {
    if (!name.trim()) return;

    createSequence.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        pause_on_reply: pauseOnReply,
        steps: [],
      },
      {
        onSuccess: () => {
          setName("");
          setDescription("");
          onSuccess();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Sequência de Nurturing</DialogTitle>
          <DialogDescription>
            Crie uma cadência multi-canal para nutrir seus leads automaticamente
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Nome da Sequência</Label>
            <Input
              placeholder="Ex: Onboarding Novos Leads"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              placeholder="Descreva o objetivo desta sequência..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="pause-on-reply"
              checked={pauseOnReply}
              onCheckedChange={(c) => setPauseOnReply(c === true)}
            />
            <Label htmlFor="pause-on-reply" className="text-sm cursor-pointer">
              Pausar automaticamente quando o contato responder
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || createSequence.isPending}
          >
            {createSequence.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Criar Sequência
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
