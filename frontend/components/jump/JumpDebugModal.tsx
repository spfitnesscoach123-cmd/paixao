/**
 * JumpDebugModal — On-demand debug overlay for Jump Camera results.
 *
 * Shows technical pipeline internals derived from existing data only:
 *   - frames[]: recorded frames (count, duration, avg FPS, gaps)
 *   - events: takeoff / peak / landing timestamps + frame indices
 *   - groundCalibration: locked landmark, cmjMode, confidence, stability
 *   - metrics: final metrics block
 *   - config: protocol, min confidence, fps target, max flight time
 *
 * No metric recalculation. Purely inspectional. Toggled by the ⚙️ icon in
 * the results header.
 */

import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type {
  JumpFrameData, JumpEvents, JumpMetrics, GroundCalibration, JumpProtocol,
} from '../../services/jump/types';
import { JUMP_DETECTION_CONFIG } from '../../services/jump/types';

const { MIN_LANDMARK_CONFIDENCE } = JUMP_DETECTION_CONFIG;

interface JumpDebugModalProps {
  visible: boolean;
  onClose: () => void;
  frames: JumpFrameData[];
  events: JumpEvents | null;
  metrics: JumpMetrics | null;
  groundCalibration: GroundCalibration;
  protocol: JumpProtocol;
}

const GAP_MULTIPLIER = 1.8; // frame delta > 1.8 * expected ⇒ gap

export const JumpDebugModal: React.FC<JumpDebugModalProps> = ({
  visible,
  onClose,
  frames,
  events,
  metrics,
  groundCalibration,
  protocol,
}) => {
  const summary = useMemo(() => {
    if (!frames || frames.length === 0) {
      return null;
    }
    const t0 = frames[0].timestamp;
    const tN = frames[frames.length - 1].timestamp;
    const durationMs = Math.max(0, tN - t0);
    const avgFps = durationMs > 0 ? (frames.length - 1) * 1000 / durationMs : 0;

    // Detect timestamp gaps (frame-to-frame delta above threshold)
    const expectedMs = 1000 / JUMP_DETECTION_CONFIG.TARGET_FPS;
    const gapThreshold = expectedMs * GAP_MULTIPLIER;
    const gaps: { atMs: number; gapMs: number; idx: number }[] = [];
    for (let i = 1; i < frames.length; i++) {
      const dt = frames[i].timestamp - frames[i - 1].timestamp;
      if (dt > gapThreshold) {
        gaps.push({
          atMs: Math.round(frames[i - 1].timestamp - t0),
          gapMs: Math.round(dt),
          idx: i - 1,
        });
      }
    }

    // Estimate discarded frames: (expected frames at targetFps) - (actual)
    const expectedFrames = Math.max(frames.length, Math.round(durationMs / expectedMs));
    const discarded = Math.max(0, expectedFrames - frames.length);
    const discardedPct = expectedFrames > 0 ? (discarded / expectedFrames) * 100 : 0;

    return { t0, tN, durationMs, avgFps, gaps, discarded, discardedPct, expectedFrames };
  }, [frames]);

  const evIndex = (ts: number | null): number | null => {
    if (ts === null || !frames.length) return null;
    let best = -1;
    let bestDiff = Infinity;
    for (let i = 0; i < frames.length; i++) {
      const d = Math.abs(frames[i].timestamp - ts);
      if (d < bestDiff) { bestDiff = d; best = i; }
    }
    return best >= 0 ? best : null;
  };

  const fmtTs = (ts: number | null): string => {
    if (ts === null || !summary) return '—';
    const rel = ts - summary.t0;
    return `${Math.round(rel)} ms`;
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Debug Overlay</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} data-testid="jump-debug-close">
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* 1. Summary */}
            <Section title="Summary">
              <Row k="Frames recorded" v={frames.length.toString()} />
              <Row k="Duration" v={summary ? `${Math.round(summary.durationMs)} ms` : '—'} />
              <Row k="Avg FPS" v={summary ? summary.avgFps.toFixed(1) : '—'} />
              <Row k="Discarded frames (est.)" v={summary ? `${summary.discarded} (${summary.discardedPct.toFixed(1)}%)` : '—'} />
              <Row k="Gaps detected" v={summary ? summary.gaps.length.toString() : '—'} />
            </Section>

            {/* 2. Events */}
            <Section title="Events">
              <TableHeader cols={['Event', 'Time', 'Frame idx']} />
              <TableRow cols={[
                'Takeoff',
                fmtTs(events?.takeoffTime ?? null),
                (evIndex(events?.takeoffTime ?? null) ?? '—').toString(),
              ]} />
              <TableRow cols={[
                'Peak',
                fmtTs(events?.peakHeightTime ?? null),
                (evIndex(events?.peakHeightTime ?? null) ?? '—').toString(),
              ]} />
              <TableRow cols={[
                'Landing',
                fmtTs(events?.landingTime ?? null),
                (evIndex(events?.landingTime ?? null) ?? '—').toString(),
              ]} />
            </Section>

            {/* 3. Timestamp gaps */}
            <Section title="Timestamp Gaps">
              {!summary || summary.gaps.length === 0 ? (
                <Text style={styles.emptyText}>Nenhum gap detectado</Text>
              ) : (
                <>
                  <TableHeader cols={['@ ms', 'Gap (ms)', 'After idx']} />
                  {summary.gaps.map((g, i) => (
                    <TableRow
                      key={i}
                      cols={[g.atMs.toString(), g.gapMs.toString(), g.idx.toString()]}
                    />
                  ))}
                </>
              )}
            </Section>

            {/* 4. Calibration */}
            <Section title="Calibration">
              <Row k="Locked landmark" v={groundCalibration.lockedLandmark} />
              <Row k="CMJ mode" v={groundCalibration.cmjMode} />
              <Row k="Ground level (Y)" v={groundCalibration.groundLevel.toFixed(4)} />
              <Row k="Ground threshold (Y)" v={groundCalibration.groundThreshold.toFixed(4)} />
              <Row k="Standing hip (Y)" v={groundCalibration.standingHipY.toFixed(4)} />
              <Row k="Confidence score" v={groundCalibration.confidenceScore.toFixed(3)} />
              <Row k="Foot stability" v={groundCalibration.footStability.toFixed(3)} />
              <Row k="Pose confidence" v={groundCalibration.poseConfidence.toFixed(3)} />
            </Section>

            {/* 5. Metrics */}
            {metrics && (
              <Section title="Metrics">
                <Row k="Jump height" v={`${metrics.jumpHeightCm.toFixed(2)} cm`} />
                <Row k="Flight time" v={`${metrics.flightTimeMs.toFixed(0)} ms`} />
                <Row k="Contact time" v={`${metrics.contactTimeMs.toFixed(0)} ms`} />
                <Row k="Hip displacement" v={`${metrics.hipDisplacementCm.toFixed(2)} cm`} />
                <Row k="Takeoff velocity" v={`${metrics.takeoffVelocityMs.toFixed(3)} m/s`} />
                <Row k="Eccentric duration" v={`${metrics.eccentricDurationMs.toFixed(0)} ms`} />
                <Row k="RSImod" v={metrics.rsiMod.toFixed(3)} />
              </Section>
            )}

            {/* 6. Tech info */}
            <Section title="Tech Info">
              <Row k="Protocol" v={protocol} />
              <Row k="Min landmark confidence" v={MIN_LANDMARK_CONFIDENCE.toFixed(2)} />
              <Row k="Target FPS" v={JUMP_DETECTION_CONFIG.TARGET_FPS.toString()} />
              <Row k="Min flight time" v={`${JUMP_DETECTION_CONFIG.MIN_FLIGHT_TIME_MS} ms`} />
              <Row k="Max flight time" v={`${JUMP_DETECTION_CONFIG.MAX_FLIGHT_TIME_MS} ms`} />
              <Row k="Orient. enter width" v={JUMP_DETECTION_CONFIG.ORIENTATION_MIN_WIDTH.toFixed(3)} />
              <Row k="Orient. exit width" v={JUMP_DETECTION_CONFIG.ORIENTATION_EXIT_WIDTH.toFixed(3)} />
            </Section>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

// ─── Sub-components ──────────────────────────────────────────

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.sectionBody}>{children}</View>
  </View>
);

const Row: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <View style={styles.row}>
    <Text style={styles.rowKey}>{k}</Text>
    <Text style={styles.rowVal}>{v}</Text>
  </View>
);

const TableHeader: React.FC<{ cols: string[] }> = ({ cols }) => (
  <View style={styles.tableRow}>
    {cols.map((c, i) => (
      <Text key={i} style={[styles.tableHeaderCell, i === 0 && { flex: 1.2 }]}>{c}</Text>
    ))}
  </View>
);

const TableRow: React.FC<{ cols: string[] }> = ({ cols }) => (
  <View style={styles.tableRow}>
    {cols.map((c, i) => (
      <Text key={i} style={[styles.tableCell, i === 0 && { flex: 1.2 }]}>{c}</Text>
    ))}
  </View>
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 40,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '100%',
    backgroundColor: '#0b0f14',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  closeBtn: {
    padding: 4,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#9ca3af',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  sectionBody: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  rowKey: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
  },
  rowVal: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  tableHeaderCell: {
    flex: 1,
    color: '#9ca3af',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  tableCell: {
    flex: 1,
    color: '#fff',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  emptyText: {
    color: '#4ade80',
    fontSize: 12,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
});
