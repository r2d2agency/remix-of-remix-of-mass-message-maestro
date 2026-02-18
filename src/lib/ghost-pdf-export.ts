import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { GhostAnalysisResult } from '@/hooks/use-ghost-analysis';

const categoryLabels: Record<string, string> = {
  off_topic: 'Fora do Foco',
  deal_risk: 'Risco de Perda',
  slow_response: 'Resposta Lenta',
  no_followup: 'Sem Follow-up',
  sentiment_negative: 'Sentimento Negativo',
  opportunity: 'Oportunidade',
};

const severityLabels: Record<string, string> = {
  low: 'Baixo',
  medium: 'Médio',
  high: 'Alto',
  critical: 'Crítico',
};

const severityColors: Record<string, [number, number, number]> = {
  low: [100, 116, 139],
  medium: [234, 179, 8],
  high: [249, 115, 22],
  critical: [239, 68, 68],
};

function drawCircularProgress(doc: jsPDF, x: number, y: number, radius: number, value: number) {
  const segments = 60;
  const filled = Math.round((value / 100) * segments);
  
  // Background circle
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(2);
  doc.circle(x, y, radius);

  // Filled arc segments
  if (filled > 0) {
    doc.setDrawColor(99, 102, 241);
    doc.setLineWidth(2.5);
    for (let i = 0; i < filled; i++) {
      const angle1 = (i / segments) * 2 * Math.PI - Math.PI / 2;
      const angle2 = ((i + 1) / segments) * 2 * Math.PI - Math.PI / 2;
      const x1 = x + radius * Math.cos(angle1);
      const y1 = y + radius * Math.sin(angle1);
      const x2 = x + radius * Math.cos(angle2);
      const y2 = y + radius * Math.sin(angle2);
      doc.line(x1, y1, x2, y2);
    }
  }

  doc.setFontSize(14);
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'bold');
  doc.text(`${value}%`, x, y + 1, { align: 'center' });
}

function drawBarChart(doc: jsPDF, x: number, y: number, width: number, height: number, data: Array<{ label: string; value: number; color?: [number, number, number] }>) {
  if (data.length === 0) return;
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barWidth = (width / data.length) * 0.7;
  const gap = (width / data.length) * 0.3;

  // Baseline
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(x, y + height, x + width, y + height);

  data.forEach((d, i) => {
    const barH = (d.value / maxVal) * height;
    const bx = x + i * (barWidth + gap) + gap / 2;
    const by = y + height - barH;
    const color = d.color || [99, 102, 241];
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(bx, by, barWidth, barH, 'F');

    doc.setFontSize(6);
    doc.setTextColor(100, 100, 100);
    doc.text(d.label, bx + barWidth / 2, y + height + 4, { align: 'center' });
    doc.setTextColor(30, 30, 30);
    doc.text(String(d.value), bx + barWidth / 2, by - 2, { align: 'center' });
  });
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

export async function exportGhostPDF(result: GhostAnalysisResult, options?: { logoUrl?: string | null; orgName?: string }) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let cursorY = 20;

  // === Header ===
  doc.setFillColor(30, 30, 46);
  doc.rect(0, 0, pageWidth, 40, 'F');

  let textStartX = margin;

  // Logo
  if (options?.logoUrl) {
    const logoData = await loadImageAsBase64(options.logoUrl);
    if (logoData) {
      try {
        doc.addImage(logoData, 'PNG', margin, 5, 30, 30);
        textStartX = margin + 35;
      } catch { /* ignore logo errors */ }
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Relatório Módulo Fantasma', textStartX, 16);
  if (options?.orgName) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(options.orgName, textStartX, 23);
  }
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Gerado em: ${new Date(result.analyzed_at).toLocaleString('pt-BR')}`, textStartX, options?.orgName ? 30 : 26);
  doc.text(`Conversas analisadas: ${result.summary.total_analyzed}`, textStartX, options?.orgName ? 36 : 32);

  cursorY = 50;

  // === Summary Cards ===
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Resumo da Análise', margin, cursorY);
  cursorY += 8;

  const summaryItems = [
    { label: 'Total Analisadas', value: result.summary.total_analyzed, color: [99, 102, 241] as [number, number, number] },
    { label: 'Fora do Foco', value: result.summary.off_topic, color: [249, 115, 22] as [number, number, number] },
    { label: 'Risco de Perda', value: result.summary.deal_risk, color: [239, 68, 68] as [number, number, number] },
    { label: 'Resposta Lenta', value: result.summary.slow_response, color: [234, 179, 8] as [number, number, number] },
    { label: 'Sem Follow-up', value: result.summary.no_followup, color: [251, 146, 60] as [number, number, number] },
    { label: 'Oportunidades', value: result.summary.opportunities, color: [59, 130, 246] as [number, number, number] },
  ];

  drawBarChart(doc, margin, cursorY, pageWidth - margin * 2, 30, summaryItems);
  cursorY += 45;

  // === Resolution Rate ===
  const rr = result.summary.resolution_rate;
  if (rr !== undefined) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Taxa de Resolução', margin, cursorY);
    cursorY += 5;
    drawCircularProgress(doc, margin + 15, cursorY + 12, 10, rr);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`${rr}% das conversas foram resolvidas ou finalizadas.`, margin + 32, cursorY + 13);
    doc.setTextColor(30, 30, 30);
    cursorY += 30;
  }

  // === Avg Response Times ===
  const art = result.summary.avg_response_times;
  if (art && art.length > 0) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Tempo Médio de Resposta por Atendente', margin, cursorY);
    cursorY += 3;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin },
      head: [['Atendente', 'Tempo Médio (min)', 'Respostas']],
      body: art.map(r => [r.user_name, `${r.avg_minutes} min`, String(r.total_replies)]),
      headStyles: { fillColor: [30, 30, 46], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [245, 245, 250] },
    });
    cursorY = (doc as any).lastAutoTable.finalY + 10;
  }

  // === Peak Hours ===
  const ph = result.summary.peak_hours;
  if (ph && ph.length > 0) {
    if (cursorY > 230) { doc.addPage(); cursorY = 20; }
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('Horários de Pico de Problemas', margin, cursorY);
    cursorY += 8;

    const peakData = ph.map(p => ({
      label: `${p.hour}h`,
      value: p.count,
      color: [239, 68, 68] as [number, number, number],
    }));
    drawBarChart(doc, margin, cursorY, Math.min(ph.length * 20, pageWidth - margin * 2), 25, peakData);
    cursorY += 38;
  }

  // === Critical Clients ===
  const cc = result.summary.critical_clients;
  if (cc && cc.length > 0) {
    if (cursorY > 220) { doc.addPage(); cursorY = 20; }
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('Clientes Mais Críticos', margin, cursorY);
    cursorY += 3;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin },
      head: [['#', 'Cliente', 'Alertas', 'Categorias']],
      body: cc.slice(0, 10).map((c, i) => [
        String(i + 1),
        c.name,
        String(c.issues),
        c.categories.map(cat => categoryLabels[cat] || cat).join(', '),
      ]),
      headStyles: { fillColor: [239, 68, 68], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [254, 242, 242] },
    });
    cursorY = (doc as any).lastAutoTable.finalY + 10;
  }

  // === Team Scores ===
  const ts = result.summary.team_scores;
  if (ts && ts.length > 0) {
    if (cursorY > 220) { doc.addPage(); cursorY = 20; }
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('Performance da Equipe', margin, cursorY);
    cursorY += 3;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin },
      head: [['Atendente', 'Score', 'Conversas', 'Alertas']],
      body: ts.map(m => [m.user_name, String(m.score), String(m.conversations), String(m.issues)]),
      headStyles: { fillColor: [30, 30, 46], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [245, 245, 250] },
      didParseCell: (data: any) => {
        if (data.column.index === 1 && data.section === 'body') {
          const score = parseInt(data.cell.raw);
          if (score >= 80) data.cell.styles.textColor = [34, 197, 94];
          else if (score >= 50) data.cell.styles.textColor = [234, 179, 8];
          else data.cell.styles.textColor = [239, 68, 68];
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
    cursorY = (doc as any).lastAutoTable.finalY + 10;
  }

  // === Insights Table ===
  if (result.insights.length > 0) {
    if (cursorY > 200) { doc.addPage(); cursorY = 20; }
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(`Insights Detalhados (${result.insights.length})`, margin, cursorY);
    cursorY += 3;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin },
      head: [['Categoria', 'Severidade', 'Contato', 'Problema', 'Recomendação']],
      body: result.insights.map(ins => [
        categoryLabels[ins.category] || ins.category,
        severityLabels[ins.severity] || ins.severity,
        ins.contact_name || ins.contact_phone,
        ins.title,
        ins.recommendation,
      ]),
      headStyles: { fillColor: [30, 30, 46], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 7, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 18 },
        2: { cellWidth: 28 },
        3: { cellWidth: 45 },
        4: { cellWidth: 'auto' },
      },
      alternateRowStyles: { fillColor: [245, 245, 250] },
      didParseCell: (data: any) => {
        if (data.column.index === 1 && data.section === 'body') {
          const raw = String(data.cell.raw).toLowerCase();
          const color = severityColors[raw];
          if (color) {
            data.cell.styles.textColor = color;
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });
  }

  // === Footer on all pages ===
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Módulo Fantasma • Página ${i} de ${pageCount} • Confidencial`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    );
  }

  doc.save(`relatorio-fantasma-${new Date().toISOString().slice(0, 10)}.pdf`);
}
