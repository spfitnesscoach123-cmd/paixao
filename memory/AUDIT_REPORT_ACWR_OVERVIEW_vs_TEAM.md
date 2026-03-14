# RELATÓRIO DE AUDITORIA TÉCNICA
# Alinhamento da Métrica ACWR entre Team Dashboard e Dashboard Overview
# Data: 2026-03-14

---

## ETAPA 1 — ACWR NO TEAM DASHBOARD

**Endpoint**: `GET /api/dashboard/team`
**Função backend**: `get_team_dashboard()` (server.py:7886)
**Coleção/Fonte de dados**: `athlete_load_metrics` (via RollingLoadEngine)
**Campo retornado**: `athlete.acwr` (individual), `stats.team_avg_acwr` (média)

### Método ativo: **EWMA ACWR**

O Team Dashboard consome métricas pré-calculadas da collection `athlete_load_metrics`, populada pelo `RollingLoadEngine` durante o startup da aplicação.

**Fluxo**:
1. Na linha 8011, consulta `db.athlete_load_metrics.find({coach_id})` ordenado por data desc
2. Na linha 8016-8020, indexa por `athlete_id` (mantém apenas o mais recente)
3. Na linha 8023, mapeia o `acwr_metric` para o campo do load_engine (ex: `total_distance` → `distance`)
4. Na linha 8226-8232, obtém ACWR do campo `ewma_metric_data["acwr"]`
5. Na linha 8490, calcula média da equipe: `total_acwr / acwr_count`

**Fórmula EWMA ativa**:
- Acute EWMA: `λ=2/(7+1)=0.25`, decay exponencial
- Chronic EWMA: `λ=2/(28+1)≈0.069`, decay exponencial
- ACWR = `EWMA_acute / EWMA_chronic`

**Valor observado (João Silva)**: ACWR = **1.0** (ewma_acute=10500, ewma_chronic=10500)

---

## ETAPA 2 — ACWR NO DASHBOARD OVERVIEW

**Endpoint**: `GET /api/dashboard/overview`
**Função backend**: `get_dashboard_overview()` (server.py:8514)
**Fonte de dados**: `gps_data` (consulta direta, NÃO usa `athlete_load_metrics`)
**Campo retornado**: `athlete.acwr` (individual), `summary.team_acwr` (média)

### Método ativo: **Coupled ACWR (soma simples)**

O Dashboard Overview possui uma função `calc_acwr()` definida **inline** na linha 8669:

```python
def calc_acwr(daily_gps, ref_date=None):
    ref = ref_date or today
    acute = sum(daily_gps.get((ref - timedelta(days=i)).strftime("%Y-%m-%d"), {}).get("total_distance", 0) for i in range(7))
    chronic = sum(daily_gps.get((ref - timedelta(days=i)).strftime("%Y-%m-%d"), {}).get("total_distance", 0) for i in range(28))
    chronic_avg = chronic / 4 if chronic > 0 else 0
    return round(acute / chronic_avg, 2) if chronic_avg > 0 else None
```

**Fórmula Coupled ativa**:
- Acute = soma simples dos últimos 7 dias
- Chronic = soma dos últimos 28 dias / 4
- ACWR = Acute / Chronic_avg

**Valor observado (João Silva)**: ACWR = **0.0** (acute=0, chronic=10500)

---

## ETAPA 3 — COMPARAÇÃO DAS FONTES DE DADOS

| Aspecto | Team Dashboard | Dashboard Overview |
|---------|---------------|-------------------|
| **Coleção** | `athlete_load_metrics` | `gps_data` (direto) |
| **Pipeline** | RollingLoadEngine (pré-calculado) | Cálculo inline on-the-fly |
| **Documentos** | Métricas EWMA incrementais | Registros GPS brutos |
| **Campos usados** | `distance.acwr` | `total_distance` (soma) |
| **Janela temporal** | Decaimento exponencial (toda a história) | Últimos 7/28 dias fixos |
| **Data referência** | Data da última métrica salva | `datetime.utcnow()` |

### DIVERGÊNCIA CONFIRMADA
**Team Dashboard usa `athlete_load_metrics`** enquanto **Dashboard Overview usa `gps_data` com cálculo inline**.

---

## ETAPA 4 — COMPARAÇÃO DA FÓRMULA

### Cenário identificado: **CENÁRIO A + C combinados**

**Team Dashboard** = EWMA ACWR (métricas persistidas)
- Usa decaimento exponencial (lambda 0.25 agudo, 0.069 crônico)
- Valor é persistido na collection e consultado diretamente
- Independente do filtro de data da UI

**Dashboard Overview** = Coupled ACWR (cálculo on-the-fly)
- Usa soma simples dos últimos 7 e 28 dias a partir de `datetime.utcnow()`
- Calculado a cada requisição a partir de GPS brutos
- Sensível a gaps de dados (se não há treino nos últimos 7 dias, acute=0)

### Causa raiz da divergência numérica
João Silva tem dados GPS apenas na data `2026-03-03` (10500m total_distance).

- **EWMA**: Com 1 dia de carga, `ewma_acute = ewma_chronic = 10500.0`, logo ACWR = 1.0
- **Coupled**: Hoje é 2026-03-14. A data 2026-03-03 está há 11 dias atrás.
  - Acute (últimos 7 dias = 2026-03-08 a 2026-03-14) = **0** (nenhum treino)
  - Chronic (últimos 28 dias) = 10500 → chronic_avg = 10500/4 = 2625
  - ACWR = 0 / 2625 = **0.0**

**O Coupled ACWR retorna 0.0 porque não há dados recentes (últimos 7 dias).**
**O EWMA ACWR retorna 1.0 porque o decaimento exponencial ainda reflete a única sessão existente.**

---

## ETAPA 5 — IMPACTO DO FILTRO GLOBAL DE DATA NO OVERVIEW

O `calc_acwr()` no Overview **NÃO é afetado pelo filtro global de data**.

Evidência:
- Linha 8767: `acwr = calc_acwr(daily_gps)` — chamado sem `ref_date`, usa `today` como default
- Linha 8671: `ref = ref_date or today` onde `today = datetime.utcnow()`

O ACWR no Overview sempre calcula a partir de "hoje" (ou "ontem" se date_range="yesterday"), independente de ser 7d, 28d ou 90d.

**Porém**, o `acwr_timeline` (gráfico de ACWR ao longo do tempo) SIM usa o filtro:
- Linha 8802-8806: Itera `filter_days` vezes, chamando `calc_acwr(daily_gps, ref)` com cada data

**Nota sobre "yesterday"**: Quando `date_range="yesterday"`, o `today_str` é modificado para ontem (linha 8546), MAS a variável `today` (datetime) usada no `calc_acwr` como default **NÃO é modificada**. Isso significa que `calc_acwr()` sempre usa a data UTC atual, mesmo quando o filtro é "ontem".

O ACWR no Team Dashboard é **independente de qualquer filtro** — vem da collection `athlete_load_metrics` que foi populada no startup.

---

## ETAPA 6 — AGREGAÇÃO DE EQUIPE NO OVERVIEW

**Dashboard Overview** (server.py:9016):
```python
team_acwr = safe_avg([a["acwr"] for a in athlete_results])
```
- Usa `safe_avg`: filtra `None`, calcula média aritmética

**Team Dashboard** (server.py:8490):
```python
team_avg_acwr = round(total_acwr / acwr_count, 2) if acwr_count > 0 else 0
```
- Acumula `total_acwr += acwr` para cada atleta com ACWR válido

Ambos usam **média aritmética dos ACWRs individuais** dos atletas com dados.
A lógica de agregação é equivalente. **A divergência NÃO está na agregação**, mas sim no cálculo individual.

---

## ETAPA 7 — FRONTEND

### Team Dashboard (`team.tsx`)
- Campo usado: `data.stats.team_avg_acwr` (linha 654)
- Fallback: `parseFloat(...) || 0`
- Componente: `AnimatedMetric`, `ACWRBadge`
- ACWR individual: `athlete.acwr` renderizado via `ACWRBadge` (linha 565)
- Nenhuma transformação adicional

### Dashboard Overview (`data.tsx`)
- Campo usado: `summary.team_acwr` e `athletes[0].acwr` (linhas 494-496)
- Fallback: `acwr || 0` (linha 542)
- Componente: `GaugeChart` (label "ACWR", max=2)
- Nenhuma transformação adicional

**Os frontends consomem campos diferentes de endpoints diferentes**, mas não introduzem distorção — a divergência é 100% backend.

---

## ETAPA 8 — FALLBACKS E VALORES DEFAULT

### Backend
- **Overview**: `calc_acwr()` retorna `None` se `chronic_avg == 0` (linha 8675)
- **Overview**: `safe_avg()` ignora `None` na média (linha 9013)
- **Team Dashboard**: Se EWMA data não existe, `risk_distribution["unknown"] += 1` (linha 8251-8253)
- **Team Dashboard**: `team_avg_acwr` = 0 se `acwr_count == 0` (linha 8490)

### Frontend
- **data.tsx**: `acwr || 0` → se ACWR=null, mostra 0 no gauge
- **team.tsx**: `parseFloat(data.stats.team_avg_acwr) || 0` → mesmo comportamento

**Nenhum fallback artificial (como default=4 ou clamp) foi encontrado.**

---

## ETAPA 9 — COMPARAÇÃO DIRETA (DADOS REAIS)

### João Silva (69a6ca6a85668876432f090a)
| Aspecto | Team Dashboard | Dashboard Overview |
|---------|---------------|-------------------|
| **ACWR** | **1.0** | **0.0** |
| **Acute Load** | EWMA: 10500.0 | Soma 7d: 0 |
| **Chronic Load** | EWMA: 10500.0 | Soma 28d: 10500 |
| **Fonte** | `athlete_load_metrics` | `gps_data` (inline calc) |
| **Fórmula** | EWMA λ=0.25/0.069 | Sum(7d) / (Sum(28d)/4) |
| **Data ref** | 2026-03-03 (data do último GPS) | 2026-03-14 (today UTC) |

### Maria Santos e Pedro Costa
| Aspecto | Team Dashboard | Dashboard Overview |
|---------|---------------|-------------------|
| **ACWR** | None (sem dados) | None (sem dados) |
| **Fonte** | Sem registro em `athlete_load_metrics` | Sem GPS data |

---

## RESUMO DAS CONCLUSÕES

1. **Método no Team Dashboard**: EWMA ACWR (via RollingLoadEngine / `athlete_load_metrics`)
2. **Método no Dashboard Overview**: Coupled ACWR (cálculo inline `calc_acwr()` sobre `gps_data` bruto)
3. **Mesma fonte de dados?**: **NÃO** — Team usa `athlete_load_metrics`, Overview usa `gps_data`
4. **Mesma fórmula?**: **NÃO** — Team usa EWMA, Overview usa soma simples (Coupled)
5. **Filtro global interfere?**: O ACWR principal do Overview NÃO respeita o filtro global (sempre usa `today`). O `acwr_timeline` sim.
6. **Agregação de equipe**: Ambos usam média aritmética — **sem divergência aqui**
7. **Localização exata da divergência**: Função `calc_acwr()` inline (server.py:8669-8675) que implementa Coupled ACWR em vez de consumir `athlete_load_metrics`
8. **Fonte única de verdade recomendada**: A collection `athlete_load_metrics` populada pelo `RollingLoadEngine` (EWMA), que é cientificamente mais precisa e já é usada pelo Team Dashboard

---

## RECOMENDAÇÃO PARA CORREÇÃO

O Dashboard Overview deve:
1. Consultar `athlete_load_metrics` (mesma fonte do Team Dashboard)
2. Eliminar `calc_acwr()` inline
3. Usar os campos `distance.ewma_acute`, `distance.ewma_chronic`, e `distance.acwr` da collection
4. Manter o `acwr_timeline` mas recalcular usando EWMA em vez de Coupled

Isso alinhará ambos os dashboards para uma **fonte única de verdade** com consistência científica.
