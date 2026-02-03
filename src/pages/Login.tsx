import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useBranding } from '@/hooks/use-branding';
import { Loader2, Zap, Eye, EyeOff } from 'lucide-react';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().trim().email({ message: 'Email inválido' }),
  password: z.string().min(6, { message: 'Senha deve ter no mínimo 6 caracteres' }),
});

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { branding } = useBranding();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: { email?: string; password?: string } = {};
      result.error.errors.forEach((err) => {
        if (err.path[0] === 'email') fieldErrors.email = err.message;
        if (err.path[0] === 'password') fieldErrors.password = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsLoading(true);
    try {
      // Use validated+trimmed values
      await login(result.data.email, result.data.password);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      // Parse error message to provide specific feedback
      const errorMessage = error instanceof Error ? error.message : '';
      
      let title = 'Erro ao fazer login';
      let description = 'Ocorreu um erro inesperado. Tente novamente.';
      
      // Check for specific error patterns
      if (errorMessage.includes('401') || errorMessage.toLowerCase().includes('inválid') || errorMessage.toLowerCase().includes('credenciais')) {
        title = 'Credenciais inválidas';
        description = 'Email ou senha incorretos. Verifique os dados e tente novamente.';
      } else if (errorMessage.includes('502') || errorMessage.includes('504') || errorMessage.toLowerCase().includes('gateway')) {
        title = 'Servidor indisponível';
        description = 'O servidor está temporariamente indisponível. Tente novamente em alguns minutos.';
      } else if (errorMessage.includes('500') || errorMessage.toLowerCase().includes('internal')) {
        title = 'Erro no servidor';
        description = 'Ocorreu um erro interno. Por favor, tente novamente mais tarde.';
      } else if (errorMessage.includes('network') || errorMessage.toLowerCase().includes('fetch') || errorMessage.toLowerCase().includes('conexão')) {
        title = 'Erro de conexão';
        description = 'Não foi possível conectar ao servidor. Verifique sua conexão com a internet.';
      } else if (errorMessage) {
        description = errorMessage;
      }

      toast({
        title,
        description,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background overflow-x-hidden w-full max-w-full">
      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-4 py-8 w-full max-w-full">
        <div className="w-full max-w-md space-y-6 min-w-0">
          <Card className="shadow-neon w-full overflow-hidden">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                {branding.logo_login ? (
                  <img src={branding.logo_login} alt="Logo" className="h-16 max-w-[200px] object-contain" />
                ) : (
                  <div className="gradient-primary p-3 rounded-full neon-glow">
                    <Zap className="h-8 w-8 text-primary-foreground" />
                  </div>
                )}
              </div>
              <CardTitle className="text-2xl neon-text">Entrar no Whatsale</CardTitle>
              <CardDescription>
                Plataforma completa de CRM e automação de WhatsApp para gerenciar contatos, 
                campanhas e atendimento ao cliente
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                  />
                  {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isLoading}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="sr-only">
                        {showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      </span>
                    </Button>
                  </div>
                  {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Entrar
                </Button>
                <p className="text-sm text-muted-foreground text-center">
                  Não tem uma conta?{' '}
                  <Link to="/cadastro" className="text-primary hover:underline">
                    Cadastre-se
                  </Link>
                </p>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>

      {/* Footer with Privacy Policy link */}
      <footer className="py-4 px-4 border-t">
        <div className="max-w-md mx-auto text-center space-y-2">
          <p className="text-xs text-muted-foreground">
            Whatsale - CRM e Automação de WhatsApp
          </p>
          <div className="flex items-center justify-center gap-4 text-xs">
            <Link 
              to="/politica-privacidade" 
              className="text-muted-foreground hover:text-primary underline"
            >
              Política de Privacidade
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Whatsale. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Login;
