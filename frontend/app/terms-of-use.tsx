import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/theme';

export default function TermsOfUse() {
  const router = useRouter();

  const openEmail = () => {
    Linking.openURL('mailto:contato@loadmanagerpro.com.br');
  };

  const openPrivacyUrl = () => {
    Linking.openURL('https://loadmanagerpro.com.br/contact');
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.dark.secondary, colors.dark.primary]}
        style={styles.gradient}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            data-testid="terms-of-use-back-button"
          >
            <Ionicons name="arrow-back" size={24} color={colors.accent.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Termos de Uso</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          data-testid="terms-of-use-scroll"
        >
          <Text style={styles.docTitle}>TERMOS DE USO – LOADMANAGER PRO</Text>
          <Text style={styles.lastUpdated}>
            <Text style={styles.bold}>Última atualização:</Text> 06 de Fevereiro de 2026
          </Text>

          <View style={styles.divider} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. Aceitação dos Termos</Text>
            <Text style={styles.sectionText}>
              Ao acessar ou usar o <Text style={styles.bold}>LoadManager Pro</Text> ("Aplicativo"), você concorda em cumprir e estar vinculado a estes Termos de Uso. Caso não concorde com qualquer parte destes termos, você não deve utilizar o Aplicativo.
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. Descrição do Serviço</Text>
            <Text style={styles.sectionText}>
              O LoadManager Pro é uma plataforma de gerenciamento de carga de treino e análise de desempenho voltada para treinadores, preparadores físicos e profissionais do esporte.{'\n\n'}
              O serviço pode incluir, mas não se limita a:{'\n\n'}
              •  Monitoramento de carga de treino via dados GPS{'\n'}
              •  Análise de ACWR (Acute Workload Ratio){'\n'}
              •  Questionários de bem-estar (wellness){'\n'}
              •  Relatórios e análises de desempenho{'\n'}
              •  Comparações entre atletas{'\n'}
              •  Avaliações neuromusculares e físicas
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3. Registro e Conta</Text>
            <Text style={styles.sectionText}>
              <Text style={styles.bold}>3.1</Text> Para utilizar o Aplicativo, pode ser necessário criar uma conta com informações precisas e atualizadas.{'\n\n'}
              <Text style={styles.bold}>3.2</Text> Você é responsável por manter a confidencialidade de suas credenciais de acesso.{'\n\n'}
              <Text style={styles.bold}>3.3</Text> Você concorda em notificar imediatamente qualquer uso não autorizado de sua conta.
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>4. Uso Aceitável</Text>
            <Text style={styles.sectionText}>
              Você concorda em:{'\n\n'}
              •  Utilizar o Aplicativo apenas para fins legais{'\n'}
              •  Não violar direitos de propriedade intelectual{'\n'}
              •  Não transmitir vírus ou códigos maliciosos{'\n'}
              •  Não tentar acessar dados de outros usuários{'\n'}
              •  Não utilizar o Aplicativo para fins não autorizados{'\n'}
              •  Não compartilhar sua conta com terceiros
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>5. Propriedade Intelectual</Text>
            <Text style={styles.sectionText}>
              <Text style={styles.bold}>5.1</Text> Todo o conteúdo do Aplicativo, incluindo textos, gráficos, logotipos, ícones, imagens, software e código, é de propriedade do LoadManager Pro ou de seus licenciadores.{'\n\n'}
              <Text style={styles.bold}>5.2</Text> Você mantém a propriedade dos dados inseridos no Aplicativo, concedendo uma licença limitada para seu processamento com a finalidade de prestação do serviço.
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>6. Planos, Assinaturas e Pagamentos</Text>
            <Text style={styles.sectionText}>
              <Text style={styles.bold}>6.1</Text> O Aplicativo oferece assinatura auto-renovável ("Plano Pro"), com opções mensais.{'\n\n'}
              <Text style={styles.bold}>6.2</Text> O pagamento será cobrado na conta Apple ID do usuário no momento da confirmação da compra.{'\n\n'}
              <Text style={styles.bold}>6.3</Text> A assinatura será renovada automaticamente, a menos que seja cancelada com pelo menos 24 horas de antecedência do término do período atual.{'\n\n'}
              <Text style={styles.bold}>6.4</Text> A renovação será cobrada dentro das 24 horas anteriores ao final do período vigente.{'\n\n'}
              <Text style={styles.bold}>6.5</Text> O usuário pode gerenciar e cancelar sua assinatura a qualquer momento nas configurações da conta Apple ID.{'\n\n'}
              <Text style={styles.bold}>6.6</Text> Qualquer período não utilizado de teste gratuito será perdido após a compra de uma assinatura.{'\n\n'}
              <Text style={styles.bold}>6.7</Text> O Aplicativo pode oferecer um período de teste gratuito. Ao final do período de teste, a assinatura será automaticamente convertida em paga, salvo cancelamento prévio.
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>7. Privacidade</Text>
            <Text style={styles.sectionText}>
              O uso do Aplicativo também é regido pela nossa Política de Privacidade, que descreve como coletamos, utilizamos e protegemos suas informações.{'\n\n'}
              Para mais detalhes, acesse:{'\n'}
              <Text
                style={styles.link}
                onPress={openPrivacyUrl}
                data-testid="terms-of-use-privacy-link"
              >
                https://loadmanagerpro.com.br/contact
              </Text>
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>8. Limitação de Responsabilidade</Text>
            <Text style={styles.sectionText}>
              <Text style={styles.bold}>8.1</Text> O Aplicativo é fornecido "como está", sem garantias de qualquer tipo.{'\n\n'}
              <Text style={styles.bold}>8.2</Text> Não nos responsabilizamos por danos indiretos, incidentais ou consequenciais.{'\n\n'}
              <Text style={styles.bold}>8.3</Text> A responsabilidade total, quando aplicável, será limitada ao valor pago pelo usuário nos últimos 12 meses.
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>9. Indenização</Text>
            <Text style={styles.sectionText}>
              Você concorda em indenizar o LoadManager Pro por quaisquer reclamações, perdas ou danos decorrentes da violação destes Termos.
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>10. Modificações dos Termos</Text>
            <Text style={styles.sectionText}>
              Reservamo-nos o direito de modificar estes Termos a qualquer momento. O uso contínuo do Aplicativo após alterações constitui aceitação dos novos termos.
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>11. Rescisão</Text>
            <Text style={styles.sectionText}>
              Podemos suspender ou encerrar sua conta caso haja violação destes Termos.
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>12. Lei Aplicável</Text>
            <Text style={styles.sectionText}>
              Estes Termos são regidos pelas leis da República Federativa do Brasil.
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>13. Contato</Text>
            <Text style={styles.sectionText} selectable>
              <Text style={styles.bold}>Email:</Text>{' '}
              <Text
                style={styles.link}
                onPress={openEmail}
                data-testid="terms-of-use-email-link"
              >
                contato@loadmanagerpro.com.br
              </Text>
              {'\n'}
              <Text style={styles.bold}>Endereço:</Text>{'\n'}
              LoadManager Pro{'\n'}
              Ouro Fino – MG{'\n'}
              CEP: 37570-000{'\n'}
              Brasil
            </Text>
          </View>

          <View style={styles.divider} />
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
  docTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 8,
  },
  lastUpdated: {
    fontSize: 13,
    color: colors.text.secondary,
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: colors.text.tertiary,
    opacity: 0.2,
    marginVertical: 16,
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 17,
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
  link: {
    color: colors.accent.primary,
    textDecorationLine: 'underline',
  },
});
