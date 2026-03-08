import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Palette, Check, Loader2, RotateCcw, Sun, Moon, Plus, Pencil, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth, OrgThemeConfig } from '@/contexts/AuthContext';

interface ThemePreset {
  id: string;
  name: string;
  description?: string;
  light: Record<string, string>;
  dark: Record<string, string>;
  preview: { primary: string; accent: string; bg: string };
  isCustom?: boolean;
}

// Mini UI mockup component for theme preview
function ThemeMiniPreview({ primary, accent, bg }: { primary: string; accent: string; bg: string }) {
  // Derive lighter shade for received message
  const receivedBg = accent + '40';
  return (
    <div className="w-full h-20 rounded-md overflow-hidden border border-border/50 flex" style={{ backgroundColor: bg }}>
      {/* Mini sidebar */}
      <div className="w-6 h-full flex flex-col items-center gap-1 pt-1.5" style={{ backgroundColor: accent }}>
        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: primary }} />
        <div className="w-3 h-0.5 rounded-full opacity-40" style={{ backgroundColor: primary }} />
        <div className="w-3 h-0.5 rounded-full opacity-25" style={{ backgroundColor: primary }} />
        <div className="w-3 h-0.5 rounded-full opacity-25" style={{ backgroundColor: primary }} />
      </div>
      {/* Mini chat area */}
      <div className="flex-1 flex flex-col justify-end p-1.5 gap-1">
        {/* Received message */}
        <div className="self-start rounded-md px-1.5 py-0.5 max-w-[60%]" style={{ backgroundColor: receivedBg }}>
          <div className="h-1 w-8 rounded-full opacity-60" style={{ backgroundColor: primary }} />
          <div className="h-1 w-5 rounded-full opacity-40 mt-0.5" style={{ backgroundColor: primary }} />
        </div>
        {/* Sent message */}
        <div className="self-end rounded-md px-1.5 py-0.5 max-w-[55%]" style={{ backgroundColor: primary }}>
          <div className="h-1 w-7 rounded-full bg-white/80" />
          <div className="h-1 w-4 rounded-full bg-white/60 mt-0.5" />
        </div>
        {/* Input bar */}
        <div className="w-full h-2.5 rounded-sm border opacity-40" style={{ borderColor: primary + '60', backgroundColor: bg }} />
      </div>
    </div>
  );
}

const PRESETS: ThemePreset[] = [
  {
    id: 'default',
    name: 'Neon Azul (Padrão)',
    description: 'Azul vibrante com toques roxos. Ideal para empresas de tecnologia.',
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
    description: 'Verde sofisticado. Transmite confiança e crescimento.',
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
    description: 'Rosa elegante. Perfeito para marcas modernas e ousadas.',
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
    description: 'Laranja dourado. Energia e entusiasmo.',
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
    description: 'Azul-turquesa vibrante. Moderno e refrescante.',
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
    description: 'Roxo suave. Sofisticação e criatividade.',
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
    description: 'Laranja vivo. Dinâmico e energético.',
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
    description: 'Cinza profissional. Sóbrio e confiável.',
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
  {
    id: 'teal',
    name: 'Teal Profissional',
    description: 'Verde-azulado elegante. Equilíbrio e serenidade.',
    preview: { primary: '#14b8a6', accent: '#0d9488', bg: '#0f1a19' },
    light: {
      primary: '173 80% 40%',
      'primary-foreground': '0 0% 100%',
      accent: '173 55% 90%',
      'accent-foreground': '173 80% 28%',
      ring: '173 80% 40%',
      'sidebar-primary': '173 80% 40%',
      'sidebar-accent': '173 55% 90%',
      'sidebar-accent-foreground': '173 80% 28%',
    },
    dark: {
      primary: '173 80% 45%',
      'primary-foreground': '0 0% 100%',
      accent: '173 35% 18%',
      'accent-foreground': '173 80% 58%',
      ring: '173 80% 45%',
      'sidebar-primary': '173 80% 45%',
      'sidebar-accent': '173 35% 18%',
      'sidebar-accent-foreground': '173 80% 58%',
    }
  },
  {
    id: 'crimson',
    name: 'Vermelho Intenso',
    preview: { primary: '#dc2626', accent: '#b91c1c', bg: '#1a0f0f' },
    light: {
      primary: '0 72% 51%',
      'primary-foreground': '0 0% 100%',
      accent: '0 60% 92%',
      'accent-foreground': '0 72% 38%',
      ring: '0 72% 51%',
      'sidebar-primary': '0 72% 51%',
      'sidebar-accent': '0 60% 92%',
      'sidebar-accent-foreground': '0 72% 38%',
    },
    dark: {
      primary: '0 72% 55%',
      'primary-foreground': '0 0% 100%',
      accent: '0 40% 18%',
      'accent-foreground': '0 72% 65%',
      ring: '0 72% 55%',
      'sidebar-primary': '0 72% 55%',
      'sidebar-accent': '0 40% 18%',
      'sidebar-accent-foreground': '0 72% 65%',
    }
  },
  {
    id: 'forest',
    name: 'Floresta',
    preview: { primary: '#16a34a', accent: '#15803d', bg: '#0f1a12' },
    light: {
      primary: '142 72% 42%',
      'primary-foreground': '0 0% 100%',
      accent: '142 55% 90%',
      'accent-foreground': '142 72% 30%',
      ring: '142 72% 42%',
      'sidebar-primary': '142 72% 42%',
      'sidebar-accent': '142 55% 90%',
      'sidebar-accent-foreground': '142 72% 30%',
    },
    dark: {
      primary: '142 72% 48%',
      'primary-foreground': '0 0% 100%',
      accent: '142 35% 16%',
      'accent-foreground': '142 72% 58%',
      ring: '142 72% 48%',
      'sidebar-primary': '142 72% 48%',
      'sidebar-accent': '142 35% 16%',
      'sidebar-accent-foreground': '142 72% 58%',
    }
  },
  {
    id: 'sapphire',
    name: 'Safira',
    preview: { primary: '#2563eb', accent: '#1d4ed8', bg: '#0f1320' },
    light: {
      primary: '221 83% 53%',
      'primary-foreground': '0 0% 100%',
      accent: '221 65% 92%',
      'accent-foreground': '221 83% 40%',
      ring: '221 83% 53%',
      'sidebar-primary': '221 83% 53%',
      'sidebar-accent': '221 65% 92%',
      'sidebar-accent-foreground': '221 83% 40%',
    },
    dark: {
      primary: '221 83% 58%',
      'primary-foreground': '0 0% 100%',
      accent: '221 45% 18%',
      'accent-foreground': '221 83% 70%',
      ring: '221 83% 58%',
      'sidebar-primary': '221 83% 58%',
      'sidebar-accent': '221 45% 18%',
      'sidebar-accent-foreground': '221 83% 70%',
    }
  },
  {
    id: 'gold',
    name: 'Ouro Premium',
    preview: { primary: '#ca8a04', accent: '#a16207', bg: '#1a170d' },
    light: {
      primary: '45 93% 40%',
      'primary-foreground': '0 0% 100%',
      accent: '45 65% 90%',
      'accent-foreground': '45 93% 28%',
      ring: '45 93% 40%',
      'sidebar-primary': '45 93% 40%',
      'sidebar-accent': '45 65% 90%',
      'sidebar-accent-foreground': '45 93% 28%',
    },
    dark: {
      primary: '45 93% 47%',
      'primary-foreground': '0 0% 10%',
      accent: '45 40% 16%',
      'accent-foreground': '45 93% 58%',
      ring: '45 93% 47%',
      'sidebar-primary': '45 93% 47%',
      'sidebar-accent': '45 40% 16%',
      'sidebar-accent-foreground': '45 93% 58%',
    }
  },
  {
    id: 'magenta',
    name: 'Magenta',
    preview: { primary: '#d946ef', accent: '#c026d3', bg: '#1a0f1a' },
    light: {
      primary: '292 84% 61%',
      'primary-foreground': '0 0% 100%',
      accent: '292 60% 92%',
      'accent-foreground': '292 84% 45%',
      ring: '292 84% 61%',
      'sidebar-primary': '292 84% 61%',
      'sidebar-accent': '292 60% 92%',
      'sidebar-accent-foreground': '292 84% 45%',
    },
    dark: {
      primary: '292 84% 61%',
      'primary-foreground': '0 0% 100%',
      accent: '292 40% 20%',
      'accent-foreground': '292 84% 72%',
      ring: '292 84% 61%',
      'sidebar-primary': '292 84% 61%',
      'sidebar-accent': '292 40% 20%',
      'sidebar-accent-foreground': '292 84% 72%',
    }
  },
  {
    id: 'midnight',
    name: 'Meia-Noite',
    preview: { primary: '#3b82f6', accent: '#1e3a5f', bg: '#080c14' },
    light: {
      primary: '217 91% 60%',
      'primary-foreground': '0 0% 100%',
      accent: '217 55% 90%',
      'accent-foreground': '217 91% 42%',
      ring: '217 91% 60%',
      'sidebar-primary': '217 91% 60%',
      'sidebar-accent': '217 55% 90%',
      'sidebar-accent-foreground': '217 91% 42%',
      background: '210 30% 97%',
      card: '0 0% 100%',
    },
    dark: {
      primary: '217 91% 60%',
      'primary-foreground': '0 0% 100%',
      accent: '217 50% 14%',
      'accent-foreground': '217 91% 72%',
      ring: '217 91% 60%',
      'sidebar-primary': '217 91% 60%',
      'sidebar-accent': '217 50% 14%',
      'sidebar-accent-foreground': '217 91% 72%',
      background: '220 30% 5%',
      card: '220 25% 8%',
    }
  },
  {
    id: 'wine',
    name: 'Vinho',
    preview: { primary: '#9f1239', accent: '#881337', bg: '#1a0d10' },
    light: {
      primary: '343 88% 35%',
      'primary-foreground': '0 0% 100%',
      accent: '343 60% 92%',
      'accent-foreground': '343 88% 25%',
      ring: '343 88% 35%',
      'sidebar-primary': '343 88% 35%',
      'sidebar-accent': '343 60% 92%',
      'sidebar-accent-foreground': '343 88% 25%',
    },
    dark: {
      primary: '343 88% 45%',
      'primary-foreground': '0 0% 100%',
      accent: '343 45% 16%',
      'accent-foreground': '343 88% 60%',
      ring: '343 88% 45%',
      'sidebar-primary': '343 88% 45%',
      'sidebar-accent': '343 45% 16%',
      'sidebar-accent-foreground': '343 88% 60%',
    }
  },
  {
    id: 'lime',
    name: 'Lima',
    preview: { primary: '#84cc16', accent: '#65a30d', bg: '#141a0f' },
    light: {
      primary: '84 81% 44%',
      'primary-foreground': '0 0% 100%',
      accent: '84 55% 90%',
      'accent-foreground': '84 81% 30%',
      ring: '84 81% 44%',
      'sidebar-primary': '84 81% 44%',
      'sidebar-accent': '84 55% 90%',
      'sidebar-accent-foreground': '84 81% 30%',
    },
    dark: {
      primary: '84 81% 48%',
      'primary-foreground': '0 0% 10%',
      accent: '84 35% 16%',
      'accent-foreground': '84 81% 58%',
      ring: '84 81% 48%',
      'sidebar-primary': '84 81% 48%',
      'sidebar-accent': '84 35% 16%',
      'sidebar-accent-foreground': '84 81% 58%',
    }
  },
  {
    id: 'oceanic',
    name: 'Oceano',
    preview: { primary: '#0284c7', accent: '#0369a1', bg: '#0c1520' },
    light: {
      primary: '199 89% 48%',
      'primary-foreground': '0 0% 100%',
      accent: '199 60% 90%',
      'accent-foreground': '199 89% 35%',
      ring: '199 89% 48%',
      'sidebar-primary': '199 89% 48%',
      'sidebar-accent': '199 60% 90%',
      'sidebar-accent-foreground': '199 89% 35%',
    },
    dark: {
      primary: '199 89% 52%',
      'primary-foreground': '0 0% 100%',
      accent: '199 45% 16%',
      'accent-foreground': '199 89% 65%',
      ring: '199 89% 52%',
      'sidebar-primary': '199 89% 52%',
      'sidebar-accent': '199 45% 16%',
      'sidebar-accent-foreground': '199 89% 65%',
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
  
  // Custom themes management
  const [savedCustomThemes, setSavedCustomThemes] = useState<ThemePreset[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTheme, setEditingTheme] = useState<ThemePreset | null>(null);
  const [newThemeName, setNewThemeName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const isAdmin = user?.role && ['owner', 'admin'].includes(user.role);

  // Load saved custom themes and active preset from theme_config
  useEffect(() => {
    if (user?.theme_config) {
      const tc = user.theme_config as any;
      if (tc.preset && tc.preset !== 'custom') {
        setActivePreset(tc.preset);
        setCustomMode(false);
      } else if (tc.preset === 'custom') {
        setCustomMode(true);
        setActivePreset('custom');
      }
      if (tc.light) setCustomVarsLight(tc.light);
      if (tc.dark) setCustomVarsDark(tc.dark);
      if (tc.custom_themes && Array.isArray(tc.custom_themes)) {
        setSavedCustomThemes(tc.custom_themes.map((t: any) => ({ ...t, isCustom: true })));
      }
    }
  }, []);

  const allPresets = [...PRESETS, ...savedCustomThemes];

  const handleSelectPreset = (preset: ThemePreset) => {
    setActivePreset(preset.id);
    setCustomMode(false);
    setCustomVarsLight(preset.light);
    setCustomVarsDark(preset.dark);
    previewTheme({ preset: preset.id, light: preset.light, dark: preset.dark });
  };

  const handleCustomColorChange = (key: string, hex: string) => {
    const hsl = hexToHsl(hex);
    if (editingMode === 'light') {
      setCustomVarsLight(prev => ({ ...prev, [key]: hsl }));
    } else {
      setCustomVarsDark(prev => ({ ...prev, [key]: hsl }));
    }
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

  // Save as a named custom theme
  const handleSaveCustomTheme = () => {
    if (!newThemeName.trim()) {
      toast.error('Digite um nome para o tema');
      return;
    }

    const primaryLight = customVarsLight['primary'] || '250 90% 55%';
    const primaryDark = customVarsDark['primary'] || '250 100% 65%';
    const accentDark = customVarsDark['accent'] || '260 60% 20%';

    const newTheme: ThemePreset = {
      id: editingTheme ? editingTheme.id : `custom-${Date.now()}`,
      name: newThemeName.trim(),
      isCustom: true,
      light: { ...customVarsLight },
      dark: { ...customVarsDark },
      preview: {
        primary: hslToHex(primaryDark),
        accent: hslToHex(accentDark),
        bg: hslToHex(customVarsDark['background'] || '240 20% 6%'),
      },
    };

    // Auto-fill foreground/ring/sidebar if missing
    if (!newTheme.light['primary-foreground']) newTheme.light['primary-foreground'] = '0 0% 100%';
    if (!newTheme.light['ring']) newTheme.light['ring'] = primaryLight;
    if (!newTheme.light['sidebar-primary']) newTheme.light['sidebar-primary'] = primaryLight;
    if (!newTheme.dark['primary-foreground']) newTheme.dark['primary-foreground'] = '0 0% 100%';
    if (!newTheme.dark['ring']) newTheme.dark['ring'] = primaryDark;
    if (!newTheme.dark['sidebar-primary']) newTheme.dark['sidebar-primary'] = primaryDark;

    setSavedCustomThemes(prev => {
      if (editingTheme) {
        return prev.map(t => t.id === editingTheme.id ? newTheme : t);
      }
      return [...prev, newTheme];
    });

    setActivePreset(newTheme.id);
    setCustomMode(false);
    setShowCreateDialog(false);
    setEditingTheme(null);
    setNewThemeName('');
    toast.success(editingTheme ? 'Tema atualizado!' : 'Tema criado! Clique em "Salvar Tema" para aplicar.');
  };

  const handleEditCustomTheme = (theme: ThemePreset) => {
    setEditingTheme(theme);
    setNewThemeName(theme.name);
    setCustomVarsLight(theme.light);
    setCustomVarsDark(theme.dark);
    setShowCreateDialog(true);
    previewTheme({ preset: 'custom', light: theme.light, dark: theme.dark });
  };

  const handleDeleteCustomTheme = (themeId: string) => {
    setSavedCustomThemes(prev => prev.filter(t => t.id !== themeId));
    if (activePreset === themeId) {
      setActivePreset('default');
      const style = document.getElementById('org-theme-vars');
      if (style) style.remove();
    }
    setDeleteConfirm(null);
    toast.success('Tema excluído');
  };

  const handleOpenCreateDialog = () => {
    setEditingTheme(null);
    setNewThemeName('');
    // Start from current colors
    setShowCreateDialog(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const config: any = {
        preset: activePreset,
        light: customVarsLight,
        dark: customVarsDark,
        custom_themes: savedCustomThemes.map(({ isCustom, ...rest }) => rest),
      };

      // If it's a built-in preset, use the preset's vars
      if (activePreset !== 'custom') {
        const preset = allPresets.find(p => p.id === activePreset);
        if (preset) {
          config.light = preset.light;
          config.dark = preset.dark;
        }
      }

      await api('/api/organizations/theme-config', {
        method: 'PUT',
        body: { theme_config: activePreset === 'default' && savedCustomThemes.length === 0 ? null : config },
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
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Personalização Visual
          </CardTitle>
          <CardDescription>
            Escolha um template pronto, crie seus próprios temas com nome e cores personalizadas, ou edite as cores manualmente.
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

          {/* Custom Saved Themes */}
          {savedCustomThemes.length > 0 && (
            <div className="border-t pt-4">
              <Label className="text-sm font-medium mb-3 block">Meus Temas</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {savedCustomThemes.map(theme => (
                  <div
                    key={theme.id}
                    className={`relative p-3 rounded-lg border-2 transition-all text-left group ${
                      activePreset === theme.id
                        ? 'border-primary ring-2 ring-primary/30'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <button
                      className="w-full text-left"
                      onClick={() => handleSelectPreset(theme)}
                    >
                      <div className="flex gap-1.5 mb-2">
                        <div className="w-6 h-6 rounded-full" style={{ backgroundColor: theme.preview.primary }} />
                        <div className="w-6 h-6 rounded-full" style={{ backgroundColor: theme.preview.accent }} />
                        <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: theme.preview.bg }} />
                      </div>
                      <p className="text-xs font-medium truncate pr-10">{theme.name}</p>
                    </button>
                    {activePreset === theme.id && (
                      <Check className="absolute top-2 right-2 h-4 w-4 text-primary" />
                    )}
                    {/* Edit/Delete buttons */}
                    <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEditCustomTheme(theme); }}
                        className="p-1 rounded bg-muted hover:bg-accent"
                        title="Editar"
                      >
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(theme.id); }}
                        className="p-1 rounded bg-muted hover:bg-destructive/20"
                        title="Excluir"
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Create Custom Theme Button */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-4">
              <Label className="text-sm font-medium">Cores Personalizadas</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleOpenCreateDialog}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Criar Meu Tema
                </Button>
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
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar Tema
            </Button>
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Restaurar Padrão
            </Button>
            {activePreset !== 'default' && (
              <Badge variant="secondary">
                {customMode ? 'Personalizado' : allPresets.find(p => p.id === activePreset)?.name}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Custom Theme Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => { if (!open) { setShowCreateDialog(false); setEditingTheme(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" />
              {editingTheme ? 'Editar Tema' : 'Criar Novo Tema'}
            </DialogTitle>
            <DialogDescription>
              Defina um nome e escolha as cores do seu tema personalizado.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div>
              <Label>Nome do Tema</Label>
              <Input
                value={newThemeName}
                onChange={e => setNewThemeName(e.target.value)}
                placeholder="Ex: Minha Empresa, Tema Dark Pro..."
                className="mt-1"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm">Cores</Label>
                <Tabs value={editingMode} onValueChange={(v) => setEditingMode(v as 'light' | 'dark')}>
                  <TabsList className="h-7">
                    <TabsTrigger value="light" className="text-xs h-6 gap-1">
                      <Sun className="h-3 w-3" />
                      Claro
                    </TabsTrigger>
                    <TabsTrigger value="dark" className="text-xs h-6 gap-1">
                      <Moon className="h-3 w-3" />
                      Escuro
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {EDITABLE_VARS.map(v => {
                  const vars = editingMode === 'light' ? customVarsLight : customVarsDark;
                  const hslValue = vars[v.key] || '';
                  const hexValue = hslValue ? hslToHex(hslValue) : '#6366f1';
                  return (
                    <div key={v.key} className="flex items-center gap-2">
                      <input
                        type="color"
                        value={hexValue}
                        onChange={(e) => handleCustomColorChange(v.key, e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer border border-border"
                        style={{ padding: 0 }}
                      />
                      <span className="text-xs">{v.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Live preview strip */}
            <div className="flex gap-2 items-center p-3 rounded-lg bg-muted/50 border">
              <span className="text-xs text-muted-foreground">Preview:</span>
              <div className="flex gap-1.5">
                <div className="w-8 h-8 rounded-full border" style={{ backgroundColor: hslToHex(customVarsDark['primary'] || '250 100% 65%') }} />
                <div className="w-8 h-8 rounded-full border" style={{ backgroundColor: hslToHex(customVarsDark['accent'] || '260 60% 20%') }} />
                <div className="w-8 h-8 rounded-full border" style={{ backgroundColor: hslToHex(customVarsDark['background'] || '240 20% 6%') }} />
              </div>
              <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={handlePreviewCustom}>
                Pré-visualizar
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); setEditingTheme(null); }}>
              Cancelar
            </Button>
            <Button onClick={handleSaveCustomTheme}>
              <Save className="h-4 w-4 mr-2" />
              {editingTheme ? 'Atualizar Tema' : 'Criar Tema'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir Tema</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir este tema? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDeleteCustomTheme(deleteConfirm)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
