import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Loader2, Clock, CalendarIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';

interface HourlyData {
  hour: number;
  label: string;
  total: number;
  received: number;
  sent: number;
}

interface HourlyChartProps {
  className?: string;
}

export function HourlyChart({ className }: HourlyChartProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [data, setData] = useState<HourlyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAverage, setIsAverage] = useState(false);
  const [peakHour, setPeakHour] = useState<string>('');

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedDate) {
        params.append('date', format(selectedDate, 'yyyy-MM-dd'));
      }

      const response = await api<{ hourly_stats: HourlyData[]; is_average: boolean }>(
        `/api/chat/conversations/hourly-stats?${params.toString()}`
      );

      setData(response.hourly_stats || []);
      setIsAverage(response.is_average);

      // Find peak hour
      const peak = (response.hourly_stats || []).reduce((max, h) => h.total > max.total ? h : max, { total: 0, label: '' } as HourlyData);
      setPeakHour(peak.total > 0 ? peak.label : '');
    } catch (error) {
      console.error('Error loading hourly stats:', error);
      setData([]);
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
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-semibold text-foreground">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  };

  const totalMessages = data.reduce((sum, h) => sum + h.total, 0);

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Distribuição por Horário
            </CardTitle>
            <CardDescription>
              {isAverage ? 'Média dos últimos 30 dias' : selectedDate ? format(selectedDate, "dd 'de' MMMM", { locale: ptBR }) : 'Média dos últimos 30 dias'}
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={!selectedDate ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSelectedDate(undefined)}
            >
              Média 30d
            </Button>
            <Button
              variant={selectedDate && format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSelectedDate(new Date())}
            >
              Hoje
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                  <CalendarIcon className="h-3 w-3" />
                  {selectedDate && format(selectedDate, 'yyyy-MM-dd') !== format(new Date(), 'yyyy-MM-dd')
                    ? format(selectedDate, 'dd/MM')
                    : 'Escolher dia'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  locale={ptBR}
                  disabled={{ after: new Date() }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Total:</span>
            <span className="text-sm font-bold">{totalMessages}</span>
          </div>
          {peakHour && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Pico:</span>
              <Badge variant="secondary" className="text-xs">{peakHour}</Badge>
            </div>
          )}
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
              <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                  interval={2}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px' }} iconType="circle" iconSize={8} />
                <Bar
                  dataKey="received"
                  name="Recebidas"
                  fill="#3b82f6"
                  radius={[2, 2, 0, 0]}
                  stackId="a"
                />
                <Bar
                  dataKey="sent"
                  name="Enviadas"
                  fill="#22c55e"
                  radius={[2, 2, 0, 0]}
                  stackId="a"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
