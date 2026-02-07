import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/theme';

export default function TermsOfUse() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.dark.secondary, colors.dark.primary]}
        style={styles.gradient}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.accent.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Termos de Uso</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.lastUpdated}>Última atualização: 06 de Fevereiro de 2026</Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. Aceitação dos Termos</Text>
            <Text style={styles.sectionText}>
              Ao acessar ou usar o Load Manager Football App ("Aplicativo"), você concorda em cumprir e estar 
              vinculado a estes Termos de Uso. Se você não concordar com qualquer parte destes termos, não 
              poderá acessar o Aplicativo.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. Descrição do Serviço</Text>
            <Text style={styles.sectionText}>
              O Load Manager Football App é uma plataforma de gerenciamento de carga de treino projetada para 
              treinadores, preparadores físicos e profissionais do esporte. O serviço inclui:{'\n\n'}
              • Monitoramento de carga de treino via dados GPS{'\n'}
              • Análise de ACWR (Acute:Chronic Workload Ratio){'\n'}
              • Questionários de bem-estar{'\n'}
              • Relatórios e análises de desempenho{'\n'}
              • Comparações entre atletas
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3. Registro e Conta</Text>
            <Text style={styles.sectionText}>
              <Text style={styles.bold}>3.1</Text> Para usar o Aplicativo, você deve criar uma conta fornecendo 
              informações precisas e atualizadas.{'\n\n'}
              <Text style={styles.bold}>3.2</Text> Você é responsável por manter a confidencialidade de sua senha 
              e por todas as atividades que ocorram em sua conta.{'\n\n'}
              <Text style={styles.bold}>3.3</Text> Você deve notificar-nos imediatamente sobre qualquer uso não 
              autorizado de sua conta.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>4. Uso Aceitável</Text>
            <Text style={styles.sectionText}>
              Você concorda em:{'\n\n'}
              • Usar o Aplicativo apenas para fins legais{'\n'}
              • Não violar direitos de propriedade intelectual{'\n'}
              • Não transmitir malware ou código malicioso{'\n'}
              • Não tentar acessar dados de outros usuários{'\n'}
              • Não usar o Aplicativo para fins comerciais não autorizados{'\n'}
              • Não compartilhar sua conta com terceiros
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>5. Propriedade Intelectual</Text>
            <Text style={styles.sectionText}>
              <Text style={styles.bold}>5.1</Text> Todo o conteúdo do Aplicativo, incluindo textos, gráficos, 
              logos, ícones, imagens, software e código, é propriedade nossa ou de nossos licenciadores.{'\n\n'}
              <Text style={styles.bold}>5.2</Text> Você mantém a propriedade dos dados que insere no Aplicativo, 
              mas nos concede uma licença limitada para processar esses dados conforme necessário para fornecer 
              o serviço.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>6. Planos e Pagamentos</Text>
            <Text style={styles.sectionText}>
              <Text style={styles.bold}>6.1</Text> O Aplicativo pode oferecer planos gratuitos e pagos (assinaturas).{'\n\n'}
              <Text style={styles.bold}>6.2</Text> Assinaturas são cobradas antecipadamente em base mensal ou anual.{'\n\n'}
              <Text style={styles.bold}>6.3</Text> Cancelamentos podem ser feitos a qualquer momento através do 
              Aplicativo. O acesso continuará até o final do período já pago.{'\n\n'}
              <Text style={styles.bold}>6.4</Text> Não oferecemos reembolsos por períodos parciais.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>7. Privacidade</Text>
            <Text style={styles.sectionText}>
              O uso do Aplicativo também é regido por nossa Política de Privacidade, que descreve como coletamos, 
              usamos e protegemos suas informações pessoais. Ao usar o Aplicativo, você também concorda com a 
              Política de Privacidade.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>8. Isenção de Garantias</Text>
            <Text style={styles.sectionText}>
              O Aplicativo é fornecido "como está" e "conforme disponível". Não garantimos que:{'\n\n'}
              • O serviço será ininterrupto ou livre de erros{'\n'}
              • Os resultados serão precisos ou confiáveis{'\n'}
              • O Aplicativo atenderá a todos os seus requisitos{'\n\n'}
              <Text style={styles.bold}>IMPORTANTE:</Text> As análises e recomendações fornecidas pelo Aplicativo 
              são apenas informativas e não substituem a avaliação de profissionais qualificados.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>9. Limitação de Responsabilidade</Text>
            <Text style={styles.sectionText}>
              Em nenhuma circunstância seremos responsáveis por danos indiretos, incidentais, especiais, 
              consequenciais ou punitivos, incluindo perda de lucros, dados, uso, boa vontade ou outras perdas 
              intangíveis, resultantes de:{'\n\n'}
              • Seu acesso ou uso do Aplicativo{'\n'}
              • Qualquer conduta ou conteúdo de terceiros{'\n'}
              • Acesso não autorizado ou alteração de seus dados
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>10. Rescisão</Text>
            <Text style={styles.sectionText}>
              <Text style={styles.bold}>10.1</Text> Você pode encerrar sua conta a qualquer momento através das 
              configurações do Aplicativo.{'\n\n'}
              <Text style={styles.bold}>10.2</Text> Podemos suspender ou encerrar sua conta se você violar estes 
              Termos de Uso, sem aviso prévio.{'\n\n'}
              <Text style={styles.bold}>10.3</Text> Após a rescisão, seu direito de usar o Aplicativo cessará 
              imediatamente.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>11. Alterações nos Termos</Text>
            <Text style={styles.sectionText}>
              Reservamo-nos o direito de modificar estes termos a qualquer momento. Alterações significativas 
              serão notificadas através do Aplicativo ou por e-mail. O uso continuado após as alterações 
              constitui aceitação dos novos termos.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>12. Lei Aplicável</Text>
            <Text style={styles.sectionText}>
              Estes Termos serão regidos e interpretados de acordo com as leis do Brasil, sem considerar 
              conflitos de disposições legais.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>13. Contato</Text>
            <Text style={styles.sectionText}>
              Para questões sobre estes Termos de Uso:{'\n\n'}
              E-mail: legal@loadmanager.app{'\n'}
              Endereço: [Endereço da empresa]
            </Text>
          </View>
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 48,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
    flex: 1,
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  lastUpdated: {
    fontSize: 12,
    color: colors.text.tertiary,
    marginBottom: 24,
    fontStyle: 'italic',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.accent.primary,
    marginBottom: 12,
  },
  sectionText: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 22,
  },
  bold: {
    fontWeight: 'bold',
    color: colors.text.primary,
  },
});
