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

export default function PrivacyPolicy() {
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
          <Text style={styles.headerTitle}>Política de Privacidade</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.lastUpdated}>Última atualização: 06 de Fevereiro de 2026</Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. Introdução</Text>
            <Text style={styles.sectionText}>
              O Load Manager Football App ("nós", "nosso" ou "aplicativo") está comprometido em proteger sua privacidade. 
              Esta Política de Privacidade explica como coletamos, usamos, divulgamos e protegemos suas informações quando 
              você usa nosso aplicativo móvel.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. Informações que Coletamos</Text>
            <Text style={styles.sectionText}>
              <Text style={styles.bold}>2.1 Informações de Conta:</Text>{'\n'}
              • Nome completo{'\n'}
              • Endereço de e-mail{'\n'}
              • Senha (armazenada de forma criptografada){'\n\n'}
              
              <Text style={styles.bold}>2.2 Informações de Atletas:</Text>{'\n'}
              • Nome dos atletas{'\n'}
              • Data de nascimento{'\n'}
              • Posição de jogo{'\n'}
              • Dados físicos (altura, peso){'\n'}
              • Fotografias (opcional){'\n\n'}
              
              <Text style={styles.bold}>2.3 Dados de Desempenho:</Text>{'\n'}
              • Dados GPS de treinos e jogos{'\n'}
              • Métricas de carga de trabalho{'\n'}
              • Questionários de bem-estar{'\n'}
              • Avaliações físicas
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3. Como Usamos Suas Informações</Text>
            <Text style={styles.sectionText}>
              Utilizamos as informações coletadas para:{'\n\n'}
              • Fornecer, manter e melhorar nossos serviços{'\n'}
              • Calcular métricas de desempenho e análises{'\n'}
              • Gerar relatórios e insights de treinamento{'\n'}
              • Enviar notificações relacionadas ao serviço{'\n'}
              • Responder a solicitações de suporte{'\n'}
              • Detectar e prevenir atividades fraudulentas
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>4. Compartilhamento de Informações</Text>
            <Text style={styles.sectionText}>
              <Text style={styles.bold}>Não vendemos suas informações pessoais.</Text>{'\n\n'}
              Podemos compartilhar informações apenas nas seguintes situações:{'\n\n'}
              • Com seu consentimento explícito{'\n'}
              • Para cumprir obrigações legais{'\n'}
              • Com prestadores de serviços que nos auxiliam na operação do aplicativo{'\n'}
              • Em caso de fusão, aquisição ou venda de ativos (com aviso prévio)
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>5. Segurança dos Dados</Text>
            <Text style={styles.sectionText}>
              Implementamos medidas de segurança técnicas e organizacionais para proteger suas informações, incluindo:{'\n\n'}
              • Criptografia de dados em trânsito e em repouso{'\n'}
              • Autenticação segura com tokens JWT{'\n'}
              • Acesso restrito a dados pessoais{'\n'}
              • Monitoramento regular de segurança{'\n\n'}
              No entanto, nenhum método de transmissão pela Internet é 100% seguro.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>6. Seus Direitos</Text>
            <Text style={styles.sectionText}>
              Você tem o direito de:{'\n\n'}
              • Acessar seus dados pessoais{'\n'}
              • Corrigir dados incorretos{'\n'}
              • Solicitar a exclusão de seus dados{'\n'}
              • Exportar seus dados em formato portátil{'\n'}
              • Revogar consentimentos previamente dados{'\n\n'}
              Para exercer esses direitos, entre em contato conosco através do e-mail de suporte.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>7. Retenção de Dados</Text>
            <Text style={styles.sectionText}>
              Mantemos suas informações enquanto sua conta estiver ativa ou conforme necessário para fornecer 
              nossos serviços. Após a exclusão da conta, seus dados serão removidos em até 30 dias, exceto 
              quando necessário para fins legais.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>8. Menores de Idade</Text>
            <Text style={styles.sectionText}>
              Nosso aplicativo pode processar dados de atletas menores de idade sob supervisão de treinadores 
              e preparadores físicos autorizados. Os responsáveis legais devem estar cientes e consentir com 
              o processamento desses dados.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>9. Alterações nesta Política</Text>
            <Text style={styles.sectionText}>
              Podemos atualizar esta política periodicamente. Notificaremos você sobre quaisquer alterações 
              significativas através do aplicativo ou por e-mail. O uso continuado após as alterações 
              constitui aceitação da nova política.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>10. Contato</Text>
            <Text style={styles.sectionText}>
              Para dúvidas sobre esta Política de Privacidade:{'\n\n'}
              E-mail: privacy@loadmanager.app{'\n'}
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
