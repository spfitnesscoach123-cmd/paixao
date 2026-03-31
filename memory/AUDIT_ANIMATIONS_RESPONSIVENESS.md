# AUDITORIA COMPLETA — Animacoes + Responsividade (Dashboard Visao Geral)

**Data**: 2026-03-24
**Status**: SOMENTE LEITURA — Nenhum codigo alterado
**Escopo**: `app/(tabs)/data.tsx` + `components/animations/*`

---

## 1. STATUS GERAL

| Aspecto | Status | Detalhe |
|---|---|---|
| **Animacoes — Barras verticais** | NAO FUNCIONANDO | SVG `<Rect>` renderizado com altura final. Nenhuma animacao de height. |
| **Animacoes — Linhas (graficos)** | NAO FUNCIONANDO | SVG `<Path>` renderizado completo. Nenhuma animacao de stroke-dashoffset. |
| **Animacoes — Gauges circulares** | NAO FUNCIONANDO | SVG `<Circle>` renderizado com dashArray final. Nenhuma animacao de preenchimento. |
| **Animacoes — Wrappers (FadeIn/Scale)** | FUNCIONANDO (PARCIAL) | `FadeInView` e `ChartEntryView` animam containers, NAO o conteudo SVG. |
| **Animacoes — Metricas numericas** | FUNCIONANDO | `AnimatedMetric` conta de 0 ate o valor via `useAnimatedCounter`. |
| **Responsividade** | NAO IMPLEMENTADA | Zero logica de deteccao de tela. Zero layout alternativo. |

---

## 2. DIAGNOSTICO POR TIPO

---

### 2A. ANIMACOES — BARRAS VERTICAIS

**Componentes afetados**: `MiniBarChart` (L99-112), `HorizontalBar` (L333-346)

#### MiniBarChart (barras SVG verticais)

```typescript
// data.tsx L99-112
const MiniBarChart = ({ data, color, height = 80, barWidth = 6 }) => {
  const max = Math.max(...data, 1);
  return (
    <Svg width={w} height={height}>
      {data.map((v, i) => {
        const h = (v / max) * (height - 10);  // <-- ALTURA CALCULADA ESTATICAMENTE
        return (
          <Rect key={i}
            x={i * (barWidth + 3)}
            y={height - h - 2}    // <-- POSICAO FINAL DIRETA
            width={barWidth}
            height={h}            // <-- VALOR FINAL, SEM ANIMACAO
            rx={2} fill={color} opacity={0.8}
          />
        );
      })}
    </Svg>
  );
};
```

**Diagnostico**: A altura `h` e calculada diretamente do valor dos dados e aplicada ao atributo `height` do `<Rect>` SVG. NAO existe:
- Nenhum `Animated.Value` para a altura
- Nenhum `useEffect` com timing
- Nenhuma interpolacao de 0 ate h
- Nenhum `animatedProps` do Reanimated

A barra aparece ja no tamanho final no primeiro render.

#### HorizontalBar (barras CSS horizontais)

```typescript
// data.tsx L333-346
const HorizontalBar = ({ value, max, label, color }) => {
  const pct = Math.min(value / max, 1) * 100;
  return (
    <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
      <View style={{
        height: 6,
        width: `${pct}%`,  // <-- LARGURA FINAL DIRETA
        backgroundColor: color,
        borderRadius: 3
      }} />
    </View>
  );
};
```

**Diagnostico**: Identico. `width` e definido como string `"XX%"` diretamente. NAO existe `Animated.Value` para width nem nenhuma transicao.

#### O wrapper ChartEntryView NAO resolve o problema

```typescript
// FadeInView.tsx L103-139
export const ChartEntryView = ({ children, delay = 0, duration = 600 }) => {
  const scaleY = useRef(new Animated.Value(0)).current;
  // ...
  return (
    <Animated.View style={[style, { opacity, transform: [{ scaleY }] }]}>
      {children}  // <-- SVG ja renderizado com valores finais
    </Animated.View>
  );
};
```

`ChartEntryView` aplica `transform: scaleY` no **container** (Animated.View), NAO nos elementos SVG individuais. Resultado visual:
- O bloco inteiro escala de 0 a 1 verticalmente
- O `transformOrigin` padrao e CENTER (centro do View)
- As barras NAO crescem "de baixo para cima" — o bloco inteiro "estica" do centro para fora
- O efeito e de "zoom vertical" uniforme, NAO de barras subindo individualmente

**Causa raiz**: Animacao de wrapper =/= animacao de conteudo SVG.

---

### 2B. ANIMACOES — LINHAS (GRAFICOS)

**Componente afetado**: `LineChart` (L115-167)

```typescript
// data.tsx L115-167
const LineChart = ({ lines, labels, height = 160, showArea = false }) => {
  // ...
  return (
    <Svg width={w} height={height}>
      {lines.map((line, li) => {
        const points = line.data.map((v, i) => {
          const x = padding.left + (i / Math.max(line.data.length - 1, 1)) * chartW;
          const y = padding.top + chartH * (1 - (v - minVal) / range);
          return `${x},${y}`;
        });
        const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p}`).join(' ');
        // ^^^ PATH COMPLETO CALCULADO DE UMA VEZ

        return (
          <Path d={pathD}          // <-- CAMINHO FINAL COMPLETO
            stroke={line.color}
            strokeWidth={2}
            fill="none"
            // NAO TEM strokeDasharray para mascara
            // NAO TEM strokeDashoffset animado
          />
        );
      })}
    </Svg>
  );
};
```

**Diagnostico**: O `<Path>` SVG e renderizado com o caminho `d` completo no primeiro render. Para animar uma linha da esquerda para direita, seria necessario:
1. Calcular o comprimento total do path (`getTotalLength()` ou estimativa)
2. Definir `strokeDasharray={totalLength}` e `strokeDashoffset={totalLength}` (esconde a linha)
3. Animar `strokeDashoffset` de `totalLength` ate 0 (revela progressivamente)

Nenhum destes passos existe no codigo. A linha aparece completa instantaneamente.

**Nota**: O componente `react-native-svg` suporta `strokeDasharray` e `strokeDashoffset` como props, e o Reanimated 3 suporta `useAnimatedProps` para animar propriedades SVG. Mas nenhuma dessas tecnicas e usada.

---

### 2C. ANIMACOES — GAUGES CIRCULARES

**Componente afetado**: `GaugeChart` (L72-96)

```typescript
// data.tsx L72-96
const GaugeChart = ({ value, max = 100, label, color, size = 120 }) => {
  const radius = (size - 16) / 2;
  const circumference = Math.PI * radius;
  const progress = Math.min(value / max, 1);
  const dashArray = progress * circumference;  // <-- VALOR FINAL DIRETO

  return (
    <Svg width={size} height={size / 2 + 20}>
      {/* Background arc */}
      <Circle ... strokeDasharray={`${circumference} ${circumference*2}`} />

      {/* Foreground arc (valor) */}
      <Circle ...
        strokeDasharray={`${dashArray} ${circumference*2}`}
        // ^^^ VALOR FINAL — NAO ANIMA DE 0 ATE dashArray
      />

      <SvgText ...>{value.toFixed(...)}</SvgText>
      {/* ^^^ VALOR NUMERICO FINAL — NAO USA AnimatedMetric */}
    </Svg>
  );
};
```

**Diagnostico**: O `strokeDasharray` do arco de progresso e calculado diretamente como `progress * circumference`. NAO existe:
- Nenhum `Animated.Value` para `dashArray`
- Nenhum `useAnimatedProps` para interpolar o dashArray de 0 ate o valor final
- Nenhum `useEffect` com timing para controlar a progressao
- O texto dentro do gauge (`SvgText`) tambem exibe o valor final direto, sem usar `AnimatedMetric`

Para animar um gauge de 0 ate o valor, seria necessario:
1. `Animated.Value` ou `useSharedValue` iniciando em 0
2. Animacao timing de 0 ate `progress * circumference`
3. Aplicar o valor animado via `animatedProps` no `<Circle>`

Nada disto existe.

---

### 2D. ANIMACOES — O QUE FUNCIONA (PARCIAL)

#### AnimatedMetric (contagem numerica) — FUNCIONA

```typescript
// useAnimatedCounter.ts L8-44
export function useAnimatedCounter(targetValue, duration = 700, decimals = 0, enabled = true) {
  const animValue = useRef(new Animated.Value(0)).current;
  // ...
  Animated.timing(animValue, {
    toValue: targetValue,
    duration,
    easing: Easing.out(Easing.cubic),
    useNativeDriver: false,  // <-- Necessario para listeners
  }).start();
  // ...
}
```

Usado em:
- Monotony pill (L575)
- Strain pill (L576)

**NAO usado em**:
- `GaugeChart` (usa `SvgText` estatico)
- `HorizontalBar` (usa `Text` estatico)
- Tabelas de ranking (valores estaticos)

#### FadeInView (fade + slide) — FUNCIONA

- Opacity 0→1, translateY 12→0
- `useNativeDriver: true` — eficiente
- Usado em: wrapping dos cards
- Delay staggering: 0, 120, 200, 250, 300, 400

**Porem**: Efeito sutil (12px de slide + fade). Em telas rapidas, pode parecer instantaneo. O delay mais longo e 400ms, entao o stagger total e curto.

#### ChartEntryView (scaleY) — FUNCIONA MAS COM EFEITO ERRADO

- scaleY 0→1 no container
- Transform origin = CENTER (padrao React Native)
- Resultado: "zoom vertical" do centro, NAO "barras crescendo de baixo"
- O conteudo SVG ja esta renderizado no tamanho final

---

## 3. DIAGNOSTICO — RESPONSIVIDADE (LAYOUT ADAPTATIVO)

### 3.1 Deteccao de tela

```typescript
// data.tsx L18-19
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 64;
```

**Diagnostico**: 
- `SCREEN_WIDTH` e capturado UMA VEZ no top-level do modulo via `Dimensions.get('window')`
- NAO e reativo — se a janela mudar de tamanho (ex: rotacao, Split View iPad), o valor NAO atualiza
- NAO usa `useWindowDimensions()` (hook reativo do React Native)
- NAO usa `Dimensions.addEventListener('change', ...)` para listener de mudanca
- O valor e usado APENAS para calcular `CHART_WIDTH`, NAO para decisoes de layout

### 3.2 Breakpoints

**NAO EXISTEM.** Nenhuma definicao de breakpoint em todo o arquivo:
- Nenhum `if (width > 768)` ou `if (width > 1024)`
- Nenhuma constante `TABLET_BREAKPOINT`, `DESKTOP_BREAKPOINT`
- Nenhum uso de `Platform.isPad` ou `Platform.isTV`
- Nenhum media query (CSS ou JS)

### 3.3 Layout alternativo (menu lateral)

**NAO EXISTE.** O layout do dashboard e FIXO em coluna vertical:

```typescript
// data.tsx L1282-1296 — Menu de camadas
<ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.layerMenu}>
  {LAYERS.map(l => (
    <TouchableOpacity style={[styles.layerTab, ...]} onPress={() => switchLayer(l.key)}>
      {/* Tabs horizontais em scroll */}
    </TouchableOpacity>
  ))}
</ScrollView>

// data.tsx L1299-1308 — Conteudo
<ScrollView style={styles.contentScroll} contentContainerStyle={styles.contentContainer}>
  <Animated.View style={{ opacity: fadeAnim }}>
    {renderActiveLayer()}  {/* Renderiza UMA camada por vez */}
  </Animated.View>
</ScrollView>
```

**Diagnostico**:
- O menu de camadas e SEMPRE um `ScrollView horizontal` com tabs
- O conteudo SEMPRE renderiza UMA camada por vez (switch/case em `renderActiveLayer`)
- NAO existe layout "side by side" onde o menu ficaria a esquerda e o conteudo a direita
- NAO existe `flexDirection: 'row'` condicional no container principal
- O `contentContainer` tem `padding: 16` fixo, sem `maxWidth` ou `marginHorizontal: 'auto'`

### 3.4 Estilos fixos que impedem adaptacao

```typescript
// data.tsx L1422-1445
container: { flex: 1 },
gradient: { flex: 1 },
contentScroll: { flex: 1 },
contentContainer: { padding: 16 },
card: { ... marginBottom: 12 },  // Sem maxWidth
filtersContainer: { flexDirection: 'row', paddingHorizontal: 16 },
layerMenu: { marginTop: 12, maxHeight: 44 },
```

NENHUM estilo condicional. Todos os estilos sao fixos. O layout e sempre:
```
[Header]
[Filtros (row)]
[Layer Tabs (horizontal scroll)]
[Conteudo (coluna vertical, 1 layer)]
```

### 3.5 Comportamento em iPad/Mac

O app SEMPRE assume viewport mobile:
- Sem `Platform.isPad` check
- Sem `isTablet` detection
- Sem responsive breakpoints
- Cards preenchem 100% da largura (padding 16px de cada lado)
- Em um iPad 12.9" ou MacBook, os cards se esticam horizontalmente ate a borda — nenhuma adaptacao

---

## 4. PRINCIPAIS CAUSAS RAIZ (ordenadas por impacto)

### CAUSA #1 — ALTA: Componentes SVG nao tem animacao propria

| Componente | O que deveria animar | O que realmente faz |
|---|---|---|
| `GaugeChart` | strokeDasharray de 0 ate valor | Renderiza strokeDasharray FINAL direto |
| `MiniBarChart` | height das Rects de 0 ate valor | Renderiza height FINAL direto |
| `LineChart` | strokeDashoffset do Path revelando progressivamente | Renderiza Path COMPLETO direto |
| `HorizontalBar` | width de 0% ate valor% | Renderiza width FINAL direto |
| `DonutChart` | strokeDasharray de 0 ate segmento | Renderiza segmentos FINAIS direto |

**Impacto**: TODOS os graficos SVG sao estaticos. A animacao nunca acontece porque nunca foi implementada nos componentes SVG.

### CAUSA #2 — ALTA: ChartEntryView anima o container, nao o conteudo

`ChartEntryView` aplica `transform: [{ scaleY }]` ao `Animated.View` wrapper. Isto:
- Escala o bloco INTEIRO verticalmente (como um zoom)
- O transform origin e o CENTRO (padrao RN), entao o efeito e simetrico
- NAO e equivalente a barras crescendo individualmente de baixo para cima
- Em muitos casos, com conteudo SVG de tamanho fixo, o efeito pode ser imperceptivel ou parecer um "flash"

### CAUSA #3 — ALTA: Nenhuma logica de responsividade existe

- Zero `useWindowDimensions()`
- Zero breakpoints
- Zero layout alternativo para telas grandes
- Zero condicional de `flexDirection`
- O layout e hardcoded como coluna vertical mobile-first (e mobile-only)

### CAUSA #4 — MEDIA: SCREEN_WIDTH capturado uma vez (nao reativo)

`const { width: SCREEN_WIDTH } = Dimensions.get('window')` no top-level:
- Calculado na importacao do modulo, NAO reativo
- Se o usuario rotacionar o iPad ou redimensionar no Mac, `CHART_WIDTH` NAO atualiza
- Pode causar graficos cortados ou com espacamento errado apos rotacao

### CAUSA #5 — BAIXA: Texto numerico nos gauges nao usa AnimatedMetric

O `GaugeChart` renderiza o valor com `<SvgText>` estatico (L91):
```typescript
<SvgText ...>{typeof value === 'number' ? value.toFixed(...) : '--'}</SvgText>
```
Deveria usar `AnimatedMetric` ou equivalente para contar de 0 ate o valor. Atualmente mostra o numero final instantaneamente.

---

## 5. EVIDENCIAS TECNICAS

### 5.1 Prova: GaugeChart e estatico

**Arquivo**: `data.tsx` L72-96
**Evidencia**: O componente e uma funcao pura que recebe `value` como prop e calcula `dashArray = progress * circumference` diretamente. NAO tem `useRef`, `useEffect`, `Animated.Value`, `useState` ou qualquer mecanismo de mudanca temporal. E um render unico e estatico.

### 5.2 Prova: MiniBarChart e estatico

**Arquivo**: `data.tsx` L99-112
**Evidencia**: O `.map()` itera sobre `data` e calcula `h = (v / max) * (height - 10)` para cada barra. O `<Rect height={h}>` e atribuido diretamente. Nenhum hook, nenhuma ref animada.

### 5.3 Prova: LineChart e estatico

**Arquivo**: `data.tsx` L115-167
**Evidencia**: `pathD` e construido como string completa (`M...L...L...`). O `<Path d={pathD}>` NAO tem `strokeDasharray` nem `strokeDashoffset` para mascarar a revelacao progressiva. Nenhum hook, nenhuma ref animada.

### 5.4 Prova: ChartEntryView transforma container, nao SVG

**Arquivo**: `FadeInView.tsx` L103-139
**Evidencia**: `<Animated.View style={[style, { opacity, transform: [{ scaleY }] }]}>{children}</Animated.View>`. O `scaleY` e aplicado ao View wrapper. Os filhos (SVG) ja estao renderizados em tamanho final quando o scaleY muda.

### 5.5 Prova: Nenhuma logica de breakpoint

**Arquivo**: `data.tsx` (inteiro, 1510 linhas)
**Evidencia**: `grep -n "useWindowDimensions\|breakpoint\|isTablet\|isPad\|isLarge\|sidebar\|lateral"` retorna ZERO resultados. O unico uso de `Dimensions` e na L18 (`Dimensions.get('window')`) para calcular largura de grafico, nao para decisao de layout.

### 5.6 Prova: Layout fixo em coluna

**Arquivo**: `data.tsx` L1298-1308
**Evidencia**: O `ScrollView` de conteudo sempre renderiza `renderActiveLayer()` que retorna um unico `<View>` com cards empilhados verticalmente. NAO existe condicao que troque para `flexDirection: 'row'` ou renderize multiplas layers simultaneamente.

---

## 6. CHECKLIST DE VALIDACAO

### ANIMACOES

| # | Hipotese | Como validar | Resultado |
|---|---|---|---|
| A1 | GaugeChart anima strokeDasharray | Buscar `Animated.Value` ou `useSharedValue` em GaugeChart | NAO ENCONTRADO — confirma estatico |
| A2 | MiniBarChart anima height das barras | Buscar animacao de `height` no Rect | NAO ENCONTRADO — confirma estatico |
| A3 | LineChart anima stroke progressivo | Buscar `strokeDashoffset` animado no Path | NAO ENCONTRADO — confirma estatico |
| A4 | HorizontalBar anima width | Buscar `Animated.Value` para width | NAO ENCONTRADO — confirma estatico |
| A5 | DonutChart anima segmentos | Buscar animacao no strokeDasharray | NAO ENCONTRADO — confirma estatico |
| A6 | ChartEntryView anima conteudo SVG | Verificar se scaleY afeta SVG internamente | NAO — scaleY e no wrapper View |
| A7 | FadeInView dispara corretamente | Verificar useEffect com deps [] | SIM — dispara no mount |
| A8 | AnimatedMetric funciona | Verificar useAnimatedCounter com listener | SIM — conta de 0 ate valor |
| A9 | Conflito de estilos estaticos sobre animados | Buscar override de opacity/transform | NAO — animacoes de wrapper nao sao sobrescritas |
| A10 | Erro silencioso bloqueando animacao | Verificar console.warn/error | NAO — nao ha erro; o codigo simplesmente nao implementa animacao SVG |

### RESPONSIVIDADE

| # | Hipotese | Como validar | Resultado |
|---|---|---|---|
| R1 | Existe useWindowDimensions | Buscar no arquivo | NAO ENCONTRADO |
| R2 | Existe Dimensions.addEventListener | Buscar no arquivo | NAO ENCONTRADO |
| R3 | Existem breakpoints | Buscar constantes de breakpoint | NAO ENCONTRADOS |
| R4 | Existe layout sidebar/lateral | Buscar flexDirection condicional | NAO ENCONTRADO |
| R5 | Platform.isPad e verificado | Buscar no arquivo | NAO ENCONTRADO |
| R6 | SCREEN_WIDTH e reativo | Verificar se usa hook ou listener | NAO — capturado uma vez no top-level |
| R7 | Existe maxWidth para telas grandes | Buscar maxWidth nos styles | NAO ENCONTRADO |
| R8 | Multiplas layers podem ser exibidas simultaneamente | Verificar renderActiveLayer | NAO — renderiza switch/case com UMA layer |
| R9 | Container pai permite flexDirection row | Verificar styles do content area | NAO — sempre coluna |
| R10 | O app diferencia iPhone de iPad | Buscar Platform.isPad | NAO ENCONTRADO |

---

## 7. RESUMO EXECUTIVO

### Por que as animacoes NAO aparecem:

Os componentes SVG (`GaugeChart`, `MiniBarChart`, `LineChart`, `HorizontalBar`, `DonutChart`) sao **100% estaticos**. Eles recebem dados como props e renderizam SVG no estado final em um unico render. NAO existe nenhum mecanismo de animacao (`Animated.Value`, `useSharedValue`, `useAnimatedProps`, `useEffect` com timing) dentro destes componentes.

Os wrappers `FadeInView` e `ChartEntryView` existem e funcionam, mas animam apenas o **container** (opacity, translateY, scaleY), nao o conteudo SVG. O efeito visual de `ChartEntryView` (scaleY) cria um "zoom vertical" do centro, que e diferente de "barras crescendo de baixo para cima".

### Por que o layout responsivo NAO funciona:

**Nao existe nenhuma implementacao de responsividade.** Zero breakpoints, zero deteccao de tamanho de tela reativa, zero layout alternativo para telas grandes. O app renderiza SEMPRE o layout mobile (coluna vertical, uma camada por vez, cards full-width) independente do dispositivo. A largura da tela (`SCREEN_WIDTH`) e capturada uma unica vez no top-level do modulo e usada apenas para calcular `CHART_WIDTH`, sem nenhuma logica condicional de layout.

---

*Documento gerado como auditoria somente-leitura. Nenhum codigo foi alterado.*
