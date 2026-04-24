import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, ShieldCheck } from "lucide-react";
import { useState } from "react";

export default function AssinaturaPublica() {
  const { token } = useParams();
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-4xl space-y-6">
        <div className="text-center space-y-2">
          <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Assinatura de Documento</h1>
          <p className="text-slate-500">Legal Gleego - Ambiente Seguro</p>
        </div>

        <Card>
          <CardHeader className="border-b bg-slate-50/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Contrato de Prestação de Serviços Jurídicos</CardTitle>
              </div>
              <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                Token: {token?.substring(0, 8)}...
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="aspect-[1/1.4] w-full bg-slate-200 flex items-center justify-center text-slate-400">
              <div className="text-center">
                <FileText className="h-16 w-16 mx-auto mb-2 opacity-50" />
                <p>Visualização do Documento PDF</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-900">Termos de Aceite</h3>
              <div className="flex items-start gap-3">
                <Checkbox 
                  id="terms" 
                  checked={accepted}
                  onCheckedChange={(checked) => setAccepted(checked as boolean)}
                  className="mt-1"
                />
                <label htmlFor="terms" className="text-sm text-slate-600 leading-relaxed">
                  Declaro que li e concordo com os termos do documento acima. Compreendo que esta assinatura eletrônica tem validade jurídica conforme a legislação vigente (MP nº 2.200-2/2001).
                </label>
              </div>
            </div>

            <Button 
              className="w-full h-12 text-lg font-semibold" 
              disabled={!accepted}
            >
              Assinar Documento
            </Button>
            
            <p className="text-center text-xs text-slate-400">
              Ao clicar em assinar, registraremos seu IP, data, hora e dispositivo para fins de segurança e validade jurídica.
            </p>
          </CardContent>
        </Card>

        <footer className="text-center text-xs text-slate-400 pt-4">
          Gerado por Legal Gleego - Gestão Jurídica Inteligente
        </footer>
      </div>
    </div>
  );
}
