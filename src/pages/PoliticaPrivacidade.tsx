import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function PoliticaPrivacidade() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Política de Privacidade</CardTitle>
            <p className="text-muted-foreground">Última atualização: {new Date().toLocaleDateString("pt-BR")}</p>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-xl font-semibold mb-3">1. Informações que Coletamos</h2>
              <p className="text-muted-foreground">
                Coletamos informações que você nos fornece diretamente, incluindo:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Nome e endereço de e-mail quando você cria uma conta</li>
                <li>Informações de contato dos seus clientes que você cadastra no sistema</li>
                <li>Dados de comunicação via WhatsApp que você gerencia através da plataforma</li>
                <li>Informações do Google Calendar quando você conecta sua conta (apenas eventos e calendários)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">2. Como Usamos suas Informações</h2>
              <p className="text-muted-foreground">Utilizamos as informações coletadas para:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Fornecer, manter e melhorar nossos serviços</li>
                <li>Sincronizar suas tarefas e compromissos com o Google Calendar</li>
                <li>Enviar notificações relacionadas ao uso do serviço</li>
                <li>Proteger contra atividades fraudulentas ou ilegais</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">3. Integração com Google Calendar</h2>
              <p className="text-muted-foreground">
                Quando você conecta sua conta do Google Calendar, solicitamos permissão para:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Ver e editar eventos em calendários que você possui</li>
                <li>Criar novos eventos para sincronizar tarefas do CRM</li>
              </ul>
              <p className="text-muted-foreground mt-2">
                Você pode revogar esse acesso a qualquer momento nas configurações da sua conta Google ou 
                diretamente nas configurações do CRM.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">4. Compartilhamento de Informações</h2>
              <p className="text-muted-foreground">
                Não vendemos, alugamos ou compartilhamos suas informações pessoais com terceiros, 
                exceto nas seguintes circunstâncias:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Com seu consentimento explícito</li>
                <li>Para cumprir obrigações legais</li>
                <li>Para proteger nossos direitos e segurança</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">5. Segurança dos Dados</h2>
              <p className="text-muted-foreground">
                Implementamos medidas de segurança técnicas e organizacionais para proteger suas 
                informações contra acesso não autorizado, alteração, divulgação ou destruição. 
                Isso inclui criptografia de dados em trânsito e em repouso.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">6. Seus Direitos</h2>
              <p className="text-muted-foreground">Você tem o direito de:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Acessar suas informações pessoais</li>
                <li>Corrigir dados incorretos ou incompletos</li>
                <li>Solicitar a exclusão dos seus dados</li>
                <li>Revogar consentimentos concedidos</li>
                <li>Desconectar integrações como o Google Calendar</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">7. Retenção de Dados</h2>
              <p className="text-muted-foreground">
                Mantemos suas informações pelo tempo necessário para fornecer os serviços solicitados 
                ou conforme exigido por lei. Quando você exclui sua conta, removemos seus dados pessoais 
                de nossos sistemas ativos.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">8. Alterações nesta Política</h2>
              <p className="text-muted-foreground">
                Podemos atualizar esta política periodicamente. Notificaremos sobre mudanças 
                significativas através do aplicativo ou por e-mail.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">9. Contato</h2>
              <p className="text-muted-foreground">
                Se você tiver dúvidas sobre esta Política de Privacidade, entre em contato conosco 
                através do suporte no aplicativo.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
