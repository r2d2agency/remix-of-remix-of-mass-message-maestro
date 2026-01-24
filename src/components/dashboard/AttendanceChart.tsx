import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Loader2, TrendingUp, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { format, subDays, startOfDay, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AttendanceData {
  date: string;
  label: string;
  atendidos: number;
  finalizados: number;
}

interface AttendanceChartProps {
  className?: string;
}

export function AttendanceChart({ className }: AttendanceChartProps) {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [data, setData] = useState<AttendanceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ atendidos: 0, finalizados: 0 });

  useEffect(() => {
    loadData();
  }, [period]);

  const loadData = async () => {
    setLoading(true);
    try {
      const days = period === 'week' ? 7 : 30;
      const endDate = new Date();
      const startDate = subDays(startOfDay(endDate), days - 1);

      // Get attendance stats per day from API
      const response = await api<{
        daily_stats: Array<{
          date: string;
          accepted: number;
          finished: number;
        }>;
      }>(`/api/chat/conversations/attendance-stats?days=${days}`).catch(() => ({ daily_stats: [] }));

      // Create a map for quick lookup
      const statsMap = new Map<string, { accepted: number; finished: number }>();
      (response.daily_stats || []).forEach(s => {
        statsMap.set(s.date, { accepted: s.accepted, finished: s.finished });
      });

      // Generate all days in the interval
      const allDays = eachDayOfInterval({ start: startDate, end: endDate });
      
      const chartData: AttendanceData[] = allDays.map(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const stats = statsMap.get(dateStr);
        
        return {
          date: dateStr,
          label: format(day, period === 'week' ? 'EEE' : 'dd/MM', { locale: ptBR }),
          atendidos: stats?.accepted || 0,
          finalizados: stats?.finished || 0,
        };
      });

      setData(chartData);
      setTotals({
        atendidos: chartData.reduce((sum, d) => sum + d.atendidos, 0),
        finalizados: chartData.reduce((sum, d) => sum + d.finalizados, 0),
      });
    } catch (error) {
      console.error('Error loading attendance chart:', error);
    } finally {
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;

    return (
      <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-medium text-foreground mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: entry.color }} 
            />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-semibold text-foreground">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Atendimentos
            </CardTitle>
            <CardDescription>Quantidade de atendimentos por dia</CardDescription>
          </div>
          <Tabs value={period} onValueChange={(v) => setPeriod(v as 'week' | 'month')}>
            <TabsList className="h-8">
              <TabsTrigger value="week" className="text-xs px-3">Semana</TabsTrigger>
              <TabsTrigger value="month" className="text-xs px-3">Mês</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="p-2 rounded-full bg-blue-500/20">
              <Users className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Atendidos</p>
              <p className="text-xl font-bold text-blue-500">{totals.atendidos}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="p-2 rounded-full bg-green-500/20">
              <Users className="h-4 w-4 text-green-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Finalizados</p>
              <p className="text-xl font-bold text-green-500">{totals.finalizados}</p>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {loading ? (
          <div className="flex items-center justify-center h-[250px]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={data} 
                margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="atendidosGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(217, 91%, 60%)" stopOpacity={1} />
                    <stop offset="100%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.6} />
                  </linearGradient>
                  <linearGradient id="finalizadosGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(142, 71%, 45%)" stopOpacity={1} />
                    <stop offset="100%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  vertical={false} 
                  stroke="hsl(var(--border))" 
                  opacity={0.5}
                />
                <XAxis 
                  dataKey="label" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar 
                  dataKey="atendidos" 
                  name="Atendidos"
                  fill="url(#atendidosGradient)"
                  radius={[4, 4, 0, 0]}
                  animationBegin={0}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
                <Bar 
                  dataKey="finalizados" 
                  name="Finalizados"
                  fill="url(#finalizadosGradient)"
                  radius={[4, 4, 0, 0]}
                  animationBegin={200}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
