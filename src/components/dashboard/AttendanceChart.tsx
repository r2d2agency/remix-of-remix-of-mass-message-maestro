import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Loader2, TrendingUp, CalendarIcon, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { format, subDays, startOfDay, eachDayOfInterval, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { DateRange } from 'react-day-picker';

interface AttendanceData {
  date: string;
  label: string;
  aguardando: number;
  atendendo: number;
  finalizados: number;
}

interface UserAvgTime {
  user_id: string;
  user_name: string;
  avg_minutes: number;
  total_finished: number;
}

interface AttendanceChartProps {
  className?: string;
}

const PRESETS = [
  { label: 'Hoje', days: 1 },
  { label: '7 dias', days: 7 },
  { label: '15 dias', days: 15 },
  { label: '30 dias', days: 30 },
];

export function AttendanceChart({ className }: AttendanceChartProps) {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 6),
    to: new Date(),
  });
  const [data, setData] = useState<AttendanceData[]>([]);
  const [userStats, setUserStats] = useState<UserAvgTime[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ aguardando: 0, atendendo: 0, finalizados: 0 });

  useEffect(() => {
    if (dateRange?.from) {
      loadData();
    }
  }, [dateRange]);

  const loadData = async () => {
    if (!dateRange?.from) return;
    
    setLoading(true);
    try {
      const endDate = dateRange.to || dateRange.from;
      const startDate = dateRange.from;
      const days = differenceInDays(endDate, startDate) + 1;

      // Get attendance stats per day from API
      const [statsResponse, avgTimeResponse] = await Promise.all([
        api<{
          daily_stats: Array<{
            date: string;
            waiting: number;
            attending: number;
            finished: number;
          }>;
        }>(`/api/chat/conversations/attendance-stats?days=${days}&start_date=${format(startDate, 'yyyy-MM-dd')}`).catch(() => ({ daily_stats: [] })),
        api<{ user_stats: UserAvgTime[] }>(`/api/chat/conversations/user-avg-time?days=${days}`).catch(() => ({ user_stats: [] })),
      ]);

      // Create a map for quick lookup
      const statsMap = new Map<string, { waiting: number; attending: number; finished: number }>();
      (statsResponse.daily_stats || []).forEach(s => {
        statsMap.set(s.date, { waiting: s.waiting, attending: s.attending, finished: s.finished });
      });

      // Generate all days in the interval
      const allDays = eachDayOfInterval({ start: startDate, end: endDate });
      
      const chartData: AttendanceData[] = allDays.map(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const stats = statsMap.get(dateStr);
        
        return {
          date: dateStr,
          label: format(day, days <= 7 ? 'EEE' : 'dd/MM', { locale: ptBR }),
          aguardando: stats?.waiting || 0,
          atendendo: stats?.attending || 0,
          finalizados: stats?.finished || 0,
        };
      });

      setData(chartData);
      setTotals({
        aguardando: chartData.reduce((sum, d) => sum + d.aguardando, 0),
        atendendo: chartData.reduce((sum, d) => sum + d.atendendo, 0),
        finalizados: chartData.reduce((sum, d) => sum + d.finalizados, 0),
      });
      setUserStats(avgTimeResponse.user_stats || []);
    } catch (error) {
      console.error('Error loading attendance chart:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePreset = (days: number) => {
    const end = new Date();
    const start = days === 1 ? end : subDays(end, days - 1);
    setDateRange({ from: start, to: end });
  };

  const formatAvgTime = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)}min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
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

  const selectedDays = dateRange?.from && dateRange?.to 
    ? differenceInDays(dateRange.to, dateRange.from) + 1 
    : 1;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Atendimentos
            </CardTitle>
            <CardDescription>Evolução diária por status</CardDescription>
          </div>
          
          {/* Period Selector */}
          <div className="flex items-center gap-2">
            {/* Preset buttons */}
            <div className="hidden sm:flex gap-1">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.days}
                  variant={selectedDays === preset.days ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => handlePreset(preset.days)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            
            {/* Date picker */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                  <CalendarIcon className="h-3 w-3" />
                  <span className="hidden sm:inline">
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "dd/MM")} - {format(dateRange.to, "dd/MM")}
                        </>
                      ) : (
                        format(dateRange.from, "dd/MM/yyyy")
                      )
                    ) : (
                      "Selecionar"
                    )}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={1}
                  locale={ptBR}
                  disabled={{ after: new Date() }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <div>
              <p className="text-[10px] text-muted-foreground">Aguardando</p>
              <p className="text-lg font-bold text-amber-500">{totals.aguardando}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <div>
              <p className="text-[10px] text-muted-foreground">Atendendo</p>
              <p className="text-lg font-bold text-blue-500">{totals.atendendo}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <div>
              <p className="text-[10px] text-muted-foreground">Finalizados</p>
              <p className="text-lg font-bold text-green-500">{totals.finalizados}</p>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {loading ? (
          <div className="flex items-center justify-center h-[220px]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart 
                data={data} 
                margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
              >
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
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  wrapperStyle={{ fontSize: '11px' }}
                  iconType="circle"
                  iconSize={8}
                />
                <Line 
                  type="monotone"
                  dataKey="aguardando" 
                  name="Aguardando"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#f59e0b' }}
                  activeDot={{ r: 5 }}
                  animationDuration={800}
                />
                <Line 
                  type="monotone"
                  dataKey="atendendo" 
                  name="Atendendo"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#3b82f6' }}
                  activeDot={{ r: 5 }}
                  animationDuration={800}
                  animationBegin={200}
                />
                <Line 
                  type="monotone"
                  dataKey="finalizados" 
                  name="Finalizados"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#22c55e' }}
                  activeDot={{ r: 5 }}
                  animationDuration={800}
                  animationBegin={400}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* User Average Time Stats */}
        {userStats.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Tempo Médio por Usuário</span>
            </div>
            <div className="grid gap-2 max-h-[120px] overflow-y-auto">
              {userStats.map((user) => (
                <div 
                  key={user.user_id} 
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-xs">
                      {user.user_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <span className="font-medium">{user.user_name}</span>
                      <p className="text-[10px] text-muted-foreground">{user.total_finished} finalizados</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={cn(
                      "font-semibold",
                      user.avg_minutes < 30 ? "text-green-500" : 
                      user.avg_minutes < 60 ? "text-amber-500" : "text-red-500"
                    )}>
                      {formatAvgTime(user.avg_minutes)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}