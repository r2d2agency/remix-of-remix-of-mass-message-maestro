import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function TermosServico() {
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
            <CardTitle className="text-2xl">Termos de Serviço</CardTitle>
            <p className="text-muted-foreground">Última atualização: {new Date().toLocaleDateString("pt-BR")}</p>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-xl font-semibold mb-3">1. Aceitação dos Termos</h2>
              <p className="text-muted-foreground">
                Ao acessar e utilizar esta plataforma, você concorda em cumprir e estar vinculado a estes Termos de Serviço. 
                Se você não concordar com qualquer parte destes termos, não deverá utilizar o serviço.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">2. Descrição do Serviço</h2>
              <p className="text-muted-foreground">
                Nossa plataforma oferece ferramentas de gestão de comunicação via WhatsApp, CRM, automações, 
                chatbots, agentes de IA e integrações com serviços de terceiros como Google Calendar. 
                O serviço é fornecido "como está" e pode ser atualizado periodicamente.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">3. Conta do Usuário</h2>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Você é responsável por manter a confidencialidade de suas credenciais de acesso</li>
                <li>Você é responsável por todas as atividades realizadas em sua conta</li>
                <li>Deve notificar imediatamente qualquer uso não autorizado de sua conta</li>
                <li>Cada conta é pessoal e intransferível dentro da organização</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">4. Uso Aceitável</h2>
              <p className="text-muted-foreground">Ao utilizar o serviço, você concorda em não:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Enviar spam ou mensagens em massa não solicitadas</li>
                <li>Violar leis aplicáveis, incluindo a LGPD (Lei Geral de Proteção de Dados)</li>
                <li>Utilizar o serviço para fins ilegais ou não autorizados</li>
                <li>Tentar acessar áreas restritas do sistema sem autorização</li>
                <li>Compartilhar suas credenciais de acesso com terceiros</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">5. Integrações com Terceiros</h2>
              <p className="text-muted-foreground">
                O serviço permite integração com plataformas de terceiros como Google Calendar, WhatsApp e outros. 
                Ao conectar essas integrações:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Você autoriza o compartilhamento de dados necessários para o funcionamento da integração</li>
                <li>Cada integração segue os termos de uso da respectiva plataforma</li>
                <li>Você pode desconectar integrações a qualquer momento</li>
                <li>Não nos responsabilizamos por indisponibilidade de serviços de terceiros</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">6. Proteção de Dados</h2>
              <p className="text-muted-foreground">
                Nos comprometemos com a proteção dos seus dados pessoais de acordo com a LGPD. 
                Para mais detalhes sobre como tratamos seus dados, consulte nossa{" "}
                <a href="/politica-privacidade" className="text-primary underline hover:no-underline">
                  Política de Privacidade
                </a>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">7. Propriedade Intelectual</h2>
              <p className="text-muted-foreground">
                Todo o conteúdo da plataforma, incluindo software, design, textos e logotipos, é de propriedade 
                exclusiva da empresa e protegido por leis de propriedade intelectual. Os dados inseridos por 
                você permanecem de sua propriedade.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">8. Limitação de Responsabilidade</h2>
              <p className="text-muted-foreground">
                O serviço é fornecido "como está", sem garantias de qualquer tipo. Não nos responsabilizamos por 
                danos indiretos, incidentais ou consequenciais decorrentes do uso ou impossibilidade de uso do serviço.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">9. Cancelamento e Rescisão</h2>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Você pode cancelar sua conta a qualquer momento</li>
                <li>Reservamo-nos o direito de suspender ou encerrar contas que violem estes termos</li>
                <li>Após o cancelamento, seus dados serão mantidos por 30 dias antes da exclusão definitiva</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">10. Alterações nos Termos</h2>
              <p className="text-muted-foreground">
                Reservamo-nos o direito de modificar estes termos a qualquer momento. As alterações entram em vigor 
                imediatamente após a publicação. O uso continuado do serviço após as alterações constitui aceitação 
                dos novos termos.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">11. Legislação Aplicável</h2>
              <p className="text-muted-foreground">
                Estes termos são regidos pelas leis da República Federativa do Brasil. Qualquer disputa será 
                resolvida no foro da comarca da sede da empresa.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">12. Contato</h2>
              <p className="text-muted-foreground">
                Para dúvidas sobre estes Termos de Serviço, entre em contato conosco através dos canais 
                de suporte disponíveis na plataforma.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}