import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Palette, Check, Loader2, RotateCcw, Sun, Moon } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth, OrgThemeConfig } from '@/contexts/AuthContext';

interface ThemePreset {
  id: string;
  name: string;
  light: Record<string, string>;
  dark: Record<string, string>;
  preview: { primary: string; accent: string; bg: string };
}

const PRESETS: ThemePreset[] = [
  {
    id: 'default',
    name: 'Neon Azul (Padrão)',
    preview: { primary: '#6366f1', accent: '#8b5cf6', bg: '#0f0f17' },
    light: {
      primary: '250 90% 55%',
      'primary-foreground': '0 0% 100%',
      accent: '250 70% 92%',
      'accent-foreground': '250 90% 45%',
      ring: '250 90% 55%',
      'sidebar-primary': '250 90% 55%',
      'sidebar-accent': '250 70% 92%',
      'sidebar-accent-foreground': '250 90% 45%',
    },
    dark: {
      primary: '250 100% 65%',
      'primary-foreground': '0 0% 100%',
      accent: '260 60% 20%',
      'accent-foreground': '260 100% 75%',
      ring: '250 100% 65%',
      'sidebar-primary': '250 100% 65%',
      'sidebar-accent': '260 60% 20%',
      'sidebar-accent-foreground': '260 100% 75%',
    }
  },
  {
    id: 'emerald',
    name: 'Esmeralda',
    preview: { primary: '#10b981', accent: '#059669', bg: '#0f1a17' },
    light: {
      primary: '160 84% 39%',
      'primary-foreground': '0 0% 100%',
      accent: '160 60% 90%',
      'accent-foreground': '160 84% 30%',
      ring: '160 84% 39%',
      'sidebar-primary': '160 84% 39%',
      'sidebar-accent': '160 60% 90%',
      'sidebar-accent-foreground': '160 84% 30%',
    },
    dark: {
      primary: '160 84% 45%',
      'primary-foreground': '0 0% 100%',
      accent: '160 40% 18%',
      'accent-foreground': '160 84% 55%',
      ring: '160 84% 45%',
      'sidebar-primary': '160 84% 45%',
      'sidebar-accent': '160 40% 18%',
      'sidebar-accent-foreground': '160 84% 55%',
    }
  },
  {
    id: 'rose',
    name: 'Rosa',
    preview: { primary: '#f43f5e', accent: '#e11d48', bg: '#1a0f12' },
    light: {
      primary: '350 89% 60%',
      'primary-foreground': '0 0% 100%',
      accent: '350 70% 92%',
      'accent-foreground': '350 89% 45%',
      ring: '350 89% 60%',
      'sidebar-primary': '350 89% 60%',
      'sidebar-accent': '350 70% 92%',
      'sidebar-accent-foreground': '350 89% 45%',
    },
    dark: {
      primary: '350 89% 60%',
      'primary-foreground': '0 0% 100%',
      accent: '350 40% 18%',
      'accent-foreground': '350 89% 70%',
      ring: '350 89% 60%',
      'sidebar-primary': '350 89% 60%',
      'sidebar-accent': '350 40% 18%',
      'sidebar-accent-foreground': '350 89% 70%',
    }
  },
  {
    id: 'amber',
    name: 'Âmbar',
    preview: { primary: '#f59e0b', accent: '#d97706', bg: '#1a170f' },
    light: {
      primary: '38 92% 50%',
      'primary-foreground': '0 0% 100%',
      accent: '38 70% 90%',
      'accent-foreground': '38 92% 35%',
      ring: '38 92% 50%',
      'sidebar-primary': '38 92% 50%',
      'sidebar-accent': '38 70% 90%',
      'sidebar-accent-foreground': '38 92% 35%',
    },
    dark: {
      primary: '38 92% 50%',
      'primary-foreground': '0 0% 10%',
      accent: '38 40% 18%',
      'accent-foreground': '38 92% 60%',
      ring: '38 92% 50%',
      'sidebar-primary': '38 92% 50%',
      'sidebar-accent': '38 40% 18%',
      'sidebar-accent-foreground': '38 92% 60%',
    }
  },
  {
    id: 'cyan',
    name: 'Ciano',
    preview: { primary: '#06b6d4', accent: '#0891b2', bg: '#0f171a' },
    light: {
      primary: '187 92% 43%',
      'primary-foreground': '0 0% 100%',
      accent: '187 60% 90%',
      'accent-foreground': '187 92% 30%',
      ring: '187 92% 43%',
      'sidebar-primary': '187 92% 43%',
      'sidebar-accent': '187 60% 90%',
      'sidebar-accent-foreground': '187 92% 30%',
    },
    dark: {
      primary: '187 92% 48%',
      'primary-foreground': '0 0% 100%',
      accent: '187 40% 18%',
      'accent-foreground': '187 92% 58%',
      ring: '187 92% 48%',
      'sidebar-primary': '187 92% 48%',
      'sidebar-accent': '187 40% 18%',
      'sidebar-accent-foreground': '187 92% 58%',
    }
  },
  {
    id: 'violet',
    name: 'Violeta',
    preview: { primary: '#8b5cf6', accent: '#7c3aed', bg: '#150f1a' },
    light: {
      primary: '263 70% 66%',
      'primary-foreground': '0 0% 100%',
      accent: '263 50% 92%',
      'accent-foreground': '263 70% 50%',
      ring: '263 70% 66%',
      'sidebar-primary': '263 70% 66%',
      'sidebar-accent': '263 50% 92%',
      'sidebar-accent-foreground': '263 70% 50%',
    },
    dark: {
      primary: '263 70% 66%',
      'primary-foreground': '0 0% 100%',
      accent: '263 40% 20%',
      'accent-foreground': '263 70% 75%',
      ring: '263 70% 66%',
      'sidebar-primary': '263 70% 66%',
      'sidebar-accent': '263 40% 20%',
      'sidebar-accent-foreground': '263 70% 75%',
    }
  },
  {
    id: 'orange',
    name: 'Laranja',
    preview: { primary: '#f97316', accent: '#ea580c', bg: '#1a130f' },
    light: {
      primary: '25 95% 53%',
      'primary-foreground': '0 0% 100%',
      accent: '25 70% 90%',
      'accent-foreground': '25 95% 40%',
      ring: '25 95% 53%',
      'sidebar-primary': '25 95% 53%',
      'sidebar-accent': '25 70% 90%',
      'sidebar-accent-foreground': '25 95% 40%',
    },
    dark: {
      primary: '25 95% 53%',
      'primary-foreground': '0 0% 100%',
      accent: '25 40% 18%',
      'accent-foreground': '25 95% 63%',
      ring: '25 95% 53%',
      'sidebar-primary': '25 95% 53%',
      'sidebar-accent': '25 40% 18%',
      'sidebar-accent-foreground': '25 95% 63%',
    }
  },
  {
    id: 'slate',
    name: 'Corporativo',
    preview: { primary: '#475569', accent: '#334155', bg: '#0f1115' },
    light: {
      primary: '215 16% 37%',
      'primary-foreground': '0 0% 100%',
      accent: '215 20% 90%',
      'accent-foreground': '215 16% 25%',
      ring: '215 16% 37%',
      'sidebar-primary': '215 16% 37%',
      'sidebar-accent': '215 20% 90%',
      'sidebar-accent-foreground': '215 16% 25%',
    },
    dark: {
      primary: '215 20% 55%',
      'primary-foreground': '0 0% 100%',
      accent: '215 20% 18%',
      'accent-foreground': '215 20% 70%',
      ring: '215 20% 55%',
      'sidebar-primary': '215 20% 55%',
      'sidebar-accent': '215 20% 18%',
      'sidebar-accent-foreground': '215 20% 70%',
    }
  },
];

// CSS variable keys that can be customized
const EDITABLE_VARS = [
  { key: 'primary', label: 'Cor Principal' },
  { key: 'accent', label: 'Cor de Destaque' },
  { key: 'background', label: 'Fundo' },
  { key: 'card', label: 'Cartão' },
  { key: 'sidebar-background', label: 'Fundo Sidebar' },
];

function hslToHex(hsl: string): string {
  const parts = hsl.split(' ').map(p => parseFloat(p));
  if (parts.length < 3) return '#6366f1';
  const [h, s, l] = [parts[0], parts[1] / 100, parts[2] / 100];
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToHsl(hex: string): string {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.substring(1, 3), 16);
    g = parseInt(hex.substring(3, 5), 16);
    b = parseInt(hex.substring(5, 7), 16);
  }
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function ThemeCustomizationPanel() {
  const { user, refreshUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [activePreset, setActivePreset] = useState<string>('default');
  const [customMode, setCustomMode] = useState(false);
  const [editingMode, setEditingMode] = useState<'light' | 'dark'>('dark');
  const [customVarsLight, setCustomVarsLight] = useState<Record<string, string>>({});
  const [customVarsDark, setCustomVarsDark] = useState<Record<string, string>>({});

  const isAdmin = user?.role && ['owner', 'admin'].includes(user.role);

  useEffect(() => {
    if (user?.theme_config) {
      if (user.theme_config.preset && user.theme_config.preset !== 'custom') {
        setActivePreset(user.theme_config.preset);
        setCustomMode(false);
      } else {
        setCustomMode(true);
        setActivePreset('custom');
      }
      if (user.theme_config.light) setCustomVarsLight(user.theme_config.light);
      if (user.theme_config.dark) setCustomVarsDark(user.theme_config.dark);
    }
  }, []);

  const handleSelectPreset = (preset: ThemePreset) => {
    setActivePreset(preset.id);
    setCustomMode(false);
    setCustomVarsLight(preset.light);
    setCustomVarsDark(preset.dark);
    
    // Live preview
    previewTheme({ preset: preset.id, light: preset.light, dark: preset.dark });
  };

  const handleCustomColorChange = (key: string, hex: string) => {
    const hsl = hexToHsl(hex);
    if (editingMode === 'light') {
      setCustomVarsLight(prev => ({ ...prev, [key]: hsl }));
    } else {
      setCustomVarsDark(prev => ({ ...prev, [key]: hsl }));
    }
    
    // Also update sidebar variants for primary
    if (key === 'primary') {
      const updates = { [key]: hsl, 'sidebar-primary': hsl, ring: hsl };
      if (editingMode === 'light') {
        setCustomVarsLight(prev => ({ ...prev, ...updates }));
      } else {
        setCustomVarsDark(prev => ({ ...prev, ...updates }));
      }
    }
  };

  const previewTheme = (config: OrgThemeConfig) => {
    // Create temporary style element
    let style = document.getElementById('org-theme-vars') as HTMLStyleElement;
    if (!style) {
      style = document.createElement('style');
      style.id = 'org-theme-vars';
      document.head.appendChild(style);
    }
    const lightVars = config.light ? Object.entries(config.light).map(([k, v]) => `--${k}: ${v};`).join('\n    ') : '';
    const darkVars = config.dark ? Object.entries(config.dark).map(([k, v]) => `--${k}: ${v};`).join('\n    ') : '';
    style.textContent = `:root, .light { ${lightVars} } .dark { ${darkVars} }`;
  };

  const handlePreviewCustom = () => {
    setCustomMode(true);
    setActivePreset('custom');
    previewTheme({ preset: 'custom', light: customVarsLight, dark: customVarsDark });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const config: OrgThemeConfig = {
        preset: activePreset,
        light: customVarsLight,
        dark: customVarsDark,
      };

      // If it's a preset, use the preset's vars
      if (activePreset !== 'custom') {
        const preset = PRESETS.find(p => p.id === activePreset);
        if (preset) {
          config.light = preset.light;
          config.dark = preset.dark;
        }
      }

      await api('/api/organizations/theme-config', {
        method: 'PUT',
        body: { theme_config: activePreset === 'default' ? null : config },
      });

      await refreshUser();
      toast.success('Tema salvo com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar tema');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setActivePreset('default');
    setCustomMode(false);
    setCustomVarsLight({});
    setCustomVarsDark({});
    // Remove custom styles
    const style = document.getElementById('org-theme-vars');
    if (style) style.remove();
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Apenas administradores podem personalizar o tema.
        </CardContent>
      </Card>
    );
  }

  const currentVars = editingMode === 'light' ? customVarsLight : customVarsDark;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          Personalização Visual
        </CardTitle>
        <CardDescription>
          Personalize as cores do sistema com sua identidade visual. Escolha um template ou crie suas próprias cores.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Presets Grid */}
        <div>
          <Label className="text-sm font-medium mb-3 block">Templates Prontos</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PRESETS.map(preset => (
              <button
                key={preset.id}
                className={`relative p-3 rounded-lg border-2 transition-all text-left ${
                  activePreset === preset.id 
                    ? 'border-primary ring-2 ring-primary/30' 
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => handleSelectPreset(preset)}
              >
                <div className="flex gap-1.5 mb-2">
                  <div className="w-6 h-6 rounded-full" style={{ backgroundColor: preset.preview.primary }} />
                  <div className="w-6 h-6 rounded-full" style={{ backgroundColor: preset.preview.accent }} />
                  <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: preset.preview.bg }} />
                </div>
                <p className="text-xs font-medium truncate">{preset.name}</p>
                {activePreset === preset.id && (
                  <Check className="absolute top-2 right-2 h-4 w-4 text-primary" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Colors */}
        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-4">
            <Label className="text-sm font-medium">Cores Personalizadas</Label>
            <Tabs value={editingMode} onValueChange={(v) => setEditingMode(v as 'light' | 'dark')}>
              <TabsList className="h-8">
                <TabsTrigger value="light" className="text-xs h-7 gap-1">
                  <Sun className="h-3 w-3" />
                  Claro
                </TabsTrigger>
                <TabsTrigger value="dark" className="text-xs h-7 gap-1">
                  <Moon className="h-3 w-3" />
                  Escuro
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {EDITABLE_VARS.map(v => {
              const hslValue = currentVars[v.key] || '';
              const hexValue = hslValue ? hslToHex(hslValue) : '#6366f1';
              return (
                <div key={v.key} className="flex items-center gap-3">
                  <div className="relative">
                    <input
                      type="color"
                      value={hexValue}
                      onChange={(e) => handleCustomColorChange(v.key, e.target.value)}
                      className="w-10 h-10 rounded-lg cursor-pointer border-2 border-border"
                      style={{ padding: 0 }}
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{v.label}</p>
                    <p className="text-xs text-muted-foreground font-mono">{hslValue || 'padrão'}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <Button variant="outline" size="sm" className="mt-3" onClick={handlePreviewCustom}>
            Pré-visualizar Personalizado
          </Button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-4 border-t">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Salvar Tema
          </Button>
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Restaurar Padrão
          </Button>
          {activePreset !== 'default' && (
            <Badge variant="secondary">
              {customMode ? 'Personalizado' : PRESETS.find(p => p.id === activePreset)?.name}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
