import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useBranding } from '@/hooks/use-branding';
import { authApi } from '@/lib/api';
import { Loader2, Zap, Check, Wifi, MessageSquare, Users, Receipt, Clock } from 'lucide-react';
import { z } from 'zod';
import { cn } from '@/lib/utils';

const registerSchema = z.object({
  name: z.string().trim().min(2, { message: 'Nome deve ter no mínimo 2 caracteres' }).max(100),
  email: z.string().trim().email({ message: 'Email inválido' }).max(255),
  password: z.string().min(6, { message: 'Senha deve ter no mínimo 6 caracteres' }),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Senhas não conferem',
  path: ['confirmPassword'],
});

interface Plan {
  id: string;
  name: string;
  description: string | null;
  max_connections: number;
  max_monthly_messages: number;
  max_users: number;
  price: number;
  billing_period: string;
  trial_days: number;
  has_chat: boolean;
  has_campaigns: boolean;
  has_asaas_integration: boolean;
}

const Cadastro = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { register } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { branding } = useBranding();

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const data = await authApi.getSignupPlans();
      setPlans(data);
      // Auto-select first plan if only one available
      if (data.length === 1) {
        setSelectedPlan(data[0].id);
      }
    } catch (error) {
      console.error('Failed to load plans:', error);
    } finally {
      setLoadingPlans(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = registerSchema.safeParse({ name, email, password, confirmPassword });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as string;
        fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    if (plans.length > 0 && !selectedPlan) {
      toast({
        title: 'Selecione um plano',
        description: 'Escolha um plano para começar seu período de teste',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      // Use validated+trimmed values
      await register(result.data.email, result.data.password, result.data.name, selectedPlan || undefined);
      navigate('/dashboard');
    } catch (error) {
      toast({
        title: 'Erro ao criar conta',
        description: error instanceof Error ? error.message : 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const selectedPlanData = plans.find(p => p.id === selectedPlan);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-4 overflow-hidden">
      <div className="w-full max-w-4xl max-h-[calc(100vh-2rem)]">
        <Card className="shadow-neon flex flex-col max-h-[calc(100vh-2rem)] overflow-hidden">
          <CardHeader className="text-center pb-4">
            <div className="flex justify-center mb-4">
              {branding.logo_login ? (
                <img src={branding.logo_login} alt="Logo" className="h-16 max-w-[200px] object-contain" />
              ) : (
                <div className="gradient-primary p-3 rounded-full neon-glow">
                  <Zap className="h-8 w-8 text-primary-foreground" />
                </div>
              )}
            </div>
            <CardTitle className="text-xl neon-text">Criar Conta</CardTitle>
          <CardDescription className="text-sm">Preencha seus dados para começar</CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
            <CardContent className="space-y-4 pt-0 flex-1 overflow-y-auto">
              {/* Plan Selection */}
              {loadingPlans ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : plans.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Escolha seu plano</Label>
                  <div className={cn(
                    "grid gap-2",
                    plans.length === 1 ? "grid-cols-1" : 
                    plans.length === 2 ? "grid-cols-1 sm:grid-cols-2" :
                    "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                  )}>
                    {plans.map((plan) => (
                      <div
                        key={plan.id}
                        onClick={() => setSelectedPlan(plan.id)}
                        className={cn(
                          "relative cursor-pointer rounded-lg border-2 p-3 transition-all hover:border-primary/50",
                          selectedPlan === plan.id 
                            ? "border-primary bg-primary/5" 
                            : "border-muted hover:bg-muted/50"
                        )}
                      >
                        {selectedPlan === plan.id && (
                          <div className="absolute -top-1.5 -right-1.5 rounded-full bg-primary p-0.5">
                            <Check className="h-2.5 w-2.5 text-primary-foreground" />
                          </div>
                        )}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <h3 className="font-medium text-sm">{plan.name}</h3>
                            <Badge variant="secondary" className="text-xs px-1.5 py-0">
                              {plan.trial_days}d grátis
                            </Badge>
                          </div>
                          
                          <div className="flex items-baseline gap-1">
                            <span className="text-lg font-bold text-primary">
                              R$ {Number(plan.price).toFixed(0)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              /{plan.billing_period === 'monthly' ? 'mês' : 'ano'}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                            <span>{plan.max_connections} conex.</span>
                            <span>•</span>
                            <span>{plan.max_users} users</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* User Info */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="name" className="text-sm">Nome</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Seu nome"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isLoading}
                    className="h-9"
                  />
                  {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="email" className="text-sm">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className="h-9"
                  />
                  {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="password" className="text-sm">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className="h-9"
                  />
                  {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="confirmPassword" className="text-sm">Confirmar Senha</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isLoading}
                    className="h-9"
                  />
                  {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
                </div>
              </div>

              {/* Trial info */}
              {selectedPlanData && (
                <div className="rounded-md bg-success/10 border border-success/30 p-2 text-center">
                  <p className="text-xs font-medium text-success">
                    🎉 <strong>{selectedPlanData.trial_days} dias grátis</strong> do plano {selectedPlanData.name}!
                  </p>
                </div>
              )}
            </CardContent>
            
            <CardFooter className="flex flex-col gap-3 pt-4 flex-shrink-0 border-t">
              <Button type="submit" className="w-full h-9" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {selectedPlanData ? `Começar ${selectedPlanData.trial_days} dias grátis` : 'Criar Conta'}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Já tem uma conta?{' '}
                <Link to="/login" className="text-primary hover:underline">
                  Entrar
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default Cadastro;