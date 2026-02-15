import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Eye, EyeOff, Save, Loader2, ExternalLink, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface AIConfig {
  ai_provider: 'none' | 'openai' | 'gemini';
  ai_model: string;
  ai_api_key: string;
}

const AI_MODELS = {
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o (Recomendado)', description: 'Mais inteligente e rápido' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Econômico e eficiente' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Alta capacidade' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Recomendado)', description: 'Rápido e poderoso' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Mais avançado' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Econômico' },
  ],
};

export function AIConfigPanel() {
  const [config, setConfig] = useState<AIConfig>({
    ai_provider: 'none',
    ai_model: '',
    ai_api_key: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const data = await api<AIConfig>('/api/organizations/ai-config');
      setConfig({
        ai_provider: data.ai_provider || 'none',
        ai_model: data.ai_model || '',
        ai_api_key: data.ai_api_key || '',
      });
    } catch (error) {
      console.error('Error loading AI config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api('/api/organizations/ai-config', {
        method: 'PUT',
        body: config,
      });
      toast.success('Configurações de IA salvas com sucesso!');
      setTestResult(null);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!config.ai_api_key || config.ai_provider === 'none') {
      toast.error('Configure um provedor e API Key primeiro');
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      await api('/api/organizations/ai-config/test', {
        method: 'POST',
        body: config,
      });
      setTestResult('success');
      toast.success('Conexão com IA testada com sucesso!');
    } catch (error: any) {
      setTestResult('error');
      toast.error(error.message || 'Falha na conexão com a IA');
    } finally {
      setTesting(false);
    }
  };

  const currentModels = config.ai_provider === 'openai' 
    ? AI_MODELS.openai 
    : config.ai_provider === 'gemini' 
      ? AI_MODELS.gemini 
      : [];

  if (loading) {
    return (
      <Card className="animate-fade-in shadow-card">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-in shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Configuração de IA
          <Badge variant="secondary" className="ml-2">Global</Badge>
        </CardTitle>
        <CardDescription>
          Configure a API Key de IA que será usada em todo o sistema (resumos, análises, agentes sem chave própria)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Provider Selection */}
        <div className="space-y-2">
          <Label>Provedor de IA</Label>
          <Select
            value={config.ai_provider}
            onValueChange={(value: 'none' | 'openai' | 'gemini') => {
              setConfig(prev => ({
                ...prev,
                ai_provider: value,
                ai_model: value === 'openai' ? 'gpt-4o-mini' : value === 'gemini' ? 'gemini-2.0-flash' : '',
              }));
              setTestResult(null);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o provedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-muted-foreground">Nenhum (desativado)</span>
              </SelectItem>
              <SelectItem value="openai">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-green-500" />
                  OpenAI (ChatGPT)
                </div>
              </SelectItem>
              <SelectItem value="gemini">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-500" />
                  Google Gemini
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {config.ai_provider !== 'none' && (
          <>
            {/* Model Selection */}
            <div className="space-y-2">
              <Label>Modelo</Label>
              <Select
                value={config.ai_model}
                onValueChange={(value) => setConfig(prev => ({ ...prev, ai_model: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o modelo" />
                </SelectTrigger>
                <SelectContent>
                  {currentModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <div className="flex flex-col">
                        <span>{model.name}</span>
                        <span className="text-xs text-muted-foreground">{model.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* API Key */}
            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="relative">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={config.ai_api_key}
                  onChange={(e) => {
                    setConfig(prev => ({ ...prev, ai_api_key: e.target.value }));
                    setTestResult(null);
                  }}
                  placeholder={config.ai_provider === 'openai' ? 'sk-...' : 'AIza...'}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {config.ai_provider === 'openai' ? (
                  <>
                    Obtenha em:{' '}
                    <a 
                      href="https://platform.openai.com/api-keys" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      platform.openai.com <ExternalLink className="h-3 w-3" />
                    </a>
                  </>
                ) : (
                  <>
                    Obtenha em:{' '}
                    <a 
                      href="https://aistudio.google.com/apikey" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      aistudio.google.com <ExternalLink className="h-3 w-3" />
                    </a>
                  </>
                )}
              </p>
            </div>

            {/* Test Result */}
            {testResult && (
              <div className={`flex items-center gap-2 p-3 rounded-lg ${
                testResult === 'success' 
                  ? 'bg-green-500/10 text-green-600 dark:text-green-400' 
                  : 'bg-destructive/10 text-destructive'
              }`}>
                {testResult === 'success' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <span className="text-sm">
                  {testResult === 'success' 
                    ? 'API Key válida e funcionando!' 
                    : 'API Key inválida ou sem permissões'}
                </span>
              </div>
            )}

            {/* Info Box */}
            <div className="bg-accent/50 rounded-lg p-4 space-y-2">
              <h4 className="font-medium text-sm">Onde esta chave será usada:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Resumos automáticos de conversas</li>
                <li>• Análise de sentimento do cliente</li>
                <li>• Sugestões de ações inteligentes</li>
                <li>• Agentes de IA sem chave própria configurada</li>
                <li>• Chatbots com IA ativada</li>
              </ul>
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          {config.ai_provider !== 'none' && (
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testing || !config.ai_api_key}
            >
              {testing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testando...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Testar Conexão
                </>
              )}
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex-1"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Salvar Configurações
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
