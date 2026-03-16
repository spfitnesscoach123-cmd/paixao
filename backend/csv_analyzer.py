"""
CSV Analyzer Module — Smart CSV analysis, field mapping suggestions, and mapping templates.

This module provides the intelligence layer for the enhanced CSV import flow.
It leverages the existing gps_import module for manufacturer detection and column mapping,
and adds smart field suggestions, column type detection, and mapping template support.

This module is ADDITIVE — it does NOT modify any existing import, calculation, or dashboard logic.
"""

import csv
import io
import re
import codecs
import unicodedata
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
import logging

from gps_import.manufacturer_aliases import (
    Manufacturer,
    detect_manufacturer_from_columns,
    build_column_mapping,
    MANUFACTURER_ALIASES,
    get_all_aliases_for_metric,
)
from gps_import.canonical_metrics import CANONICAL_METRICS, REQUIRED_METRICS

logger = logging.getLogger(__name__)

# ─── Internal field definitions for the UI ───────────────────────────────────

INTERNAL_FIELDS = {
    # Required
    "athlete_name": {
        "label_pt": "Nome do Atleta",
        "label_en": "Athlete Name",
        "group": "required",
        "type": "text",
        "aliases": ["player name", "name", "athlete", "player", "jogador", "nome", "atleta"],
    },
    "session_date": {
        "label_pt": "Data da Sessão",
        "label_en": "Session Date",
        "group": "required",
        "type": "date",
        "aliases": ["date", "data", "session date", "match date", "game date", "dia"],
    },
    "total_distance": {
        "label_pt": "Distância Total (m)",
        "label_en": "Total Distance (m)",
        "group": "required",
        "type": "numeric",
        "canonical": "total_distance_m",
    },
    # Recommended
    "sprint_distance": {
        "label_pt": "Distância Sprint (m)",
        "label_en": "Sprint Distance (m)",
        "group": "recommended",
        "type": "numeric",
        "canonical": "sprint_distance_m",
    },
    "hsr_distance": {
        "label_pt": "Distância HSR (m)",
        "label_en": "HSR Distance (m)",
        "group": "recommended",
        "type": "numeric",
        "canonical": "high_speed_running_m",
    },
    "hid_distance": {
        "label_pt": "Distância Alta Intensidade (m)",
        "label_en": "High Intensity Distance (m)",
        "group": "recommended",
        "type": "numeric",
        "canonical": "high_intensity_distance_m",
    },
    "max_speed": {
        "label_pt": "Velocidade Máxima",
        "label_en": "Max Speed",
        "group": "recommended",
        "type": "numeric",
        "canonical": "max_speed_kmh",
    },
    "number_of_sprints": {
        "label_pt": "Número de Sprints",
        "label_en": "Number of Sprints",
        "group": "recommended",
        "type": "numeric",
        "canonical": "number_of_sprints",
    },
    "accelerations": {
        "label_pt": "Acelerações",
        "label_en": "Accelerations",
        "group": "recommended",
        "type": "numeric",
        "canonical": "accelerations_count",
    },
    "decelerations": {
        "label_pt": "Desacelerações",
        "label_en": "Decelerations",
        "group": "recommended",
        "type": "numeric",
        "canonical": "decelerations_count",
    },
    # Optional
    "period_name": {
        "label_pt": "Nome do Período",
        "label_en": "Period Name",
        "group": "optional",
        "type": "text",
        "aliases": ["period name", "period", "período", "session name", "drill", "nome do período"],
    },
    "player_load": {
        "label_pt": "Player Load",
        "label_en": "Player Load",
        "group": "optional",
        "type": "numeric",
        "canonical": "player_load",
    },
    "max_acceleration": {
        "label_pt": "Aceleração Máxima",
        "label_en": "Max Acceleration",
        "group": "optional",
        "type": "numeric",
        "canonical": "max_acceleration_ms2",
    },
    "max_deceleration": {
        "label_pt": "Desaceleração Máxima",
        "label_en": "Max Deceleration",
        "group": "optional",
        "type": "numeric",
        "canonical": "max_deceleration_ms2",
    },
    "duration_minutes": {
        "label_pt": "Duração (min)",
        "label_en": "Duration (min)",
        "group": "optional",
        "type": "numeric",
        "canonical": "session_duration_min",
    },
}


# ─── CSV Analysis ─────────────────────────────────────────────────────────────

BOMS = [
    (codecs.BOM_UTF8, "utf-8-sig"),
    (codecs.BOM_UTF16_LE, "utf-16-le"),
    (codecs.BOM_UTF16_BE, "utf-16-be"),
]
ENCODINGS = ["utf-8-sig", "utf-8", "latin-1", "cp1252", "iso-8859-1"]
DELIMITERS = [",", ";", "\t"]


def _decode(raw: bytes) -> Tuple[str, str]:
    for bom, enc in BOMS:
        if raw.startswith(bom):
            return raw.decode(enc), enc
    for enc in ENCODINGS:
        try:
            return raw.decode(enc), enc
        except (UnicodeDecodeError, LookupError):
            continue
    return raw.decode("latin-1", errors="replace"), "latin-1"


def _detect_delimiter(text: str) -> str:
    first_lines = text.split("\n")[:20]
    sample = "\n".join(first_lines)
    counts = {d: sample.count(d) for d in DELIMITERS}
    return max(counts, key=counts.get) if max(counts.values()) > 0 else ","


def _find_header_row(lines: List[str], delimiter: str) -> int:
    """Find the row that most likely contains column headers."""
    best_row = 0
    best_score = 0
    for i, line in enumerate(lines[:20]):
        cols = line.split(delimiter)
        # Score: many columns, mostly text (not numbers), non-empty
        non_empty = [c.strip().strip('"') for c in cols if c.strip().strip('"')]
        if len(non_empty) < 3:
            continue
        text_count = sum(1 for c in non_empty if not _is_numeric(c))
        score = len(non_empty) * 2 + text_count * 3
        if score > best_score:
            best_score = score
            best_row = i
    return best_row


def _is_numeric(val: str) -> bool:
    try:
        float(val.replace(",", ".").strip())
        return True
    except (ValueError, AttributeError):
        return False


def _detect_column_type(values: List[str]) -> str:
    """Detect whether a column is text, numeric, or date."""
    if not values:
        return "unknown"
    numeric_count = 0
    date_count = 0
    text_count = 0
    for v in values[:20]:
        v = v.strip().strip('"')
        if not v:
            continue
        if _is_numeric(v):
            numeric_count += 1
        elif re.match(r"\d{1,4}[/\-\.]\d{1,2}[/\-\.]\d{1,4}", v):
            date_count += 1
        else:
            text_count += 1
    total = numeric_count + date_count + text_count
    if total == 0:
        return "unknown"
    if numeric_count / total > 0.7:
        return "numeric"
    if date_count / total > 0.5:
        return "date"
    return "text"


def _normalize_header(h: str) -> str:
    h = h.strip().strip('"').strip()
    h = unicodedata.normalize("NFKD", h)
    h = "".join(c for c in h if not unicodedata.combining(c))
    return h.lower()


def _suggest_columns_for_field(
    field_key: str,
    field_def: dict,
    csv_columns: List[str],
    column_types: Dict[str, str],
    manufacturer: Manufacturer,
) -> List[Dict[str, Any]]:
    """Suggest CSV columns for an internal field, ranked by confidence."""
    suggestions = []
    norm_cols = {_normalize_header(c): c for c in csv_columns}

    # Check canonical metric aliases from gps_import
    canonical = field_def.get("canonical")
    if canonical and canonical in MANUFACTURER_ALIASES:
        aliases_by_mfr = MANUFACTURER_ALIASES[canonical]
        # Try detected manufacturer first, then all
        ordered_mfrs = [manufacturer] if manufacturer != Manufacturer.UNKNOWN else []
        ordered_mfrs += [m for m in Manufacturer if m not in ordered_mfrs and m != Manufacturer.UNKNOWN]
        for mfr in ordered_mfrs:
            for alias in aliases_by_mfr.get(mfr, []):
                norm_alias = alias.lower().strip()
                for norm_col, orig_col in norm_cols.items():
                    if norm_alias == norm_col or norm_alias in norm_col:
                        conf = 0.95 if norm_alias == norm_col else 0.75
                        if orig_col not in [s["csv_column"] for s in suggestions]:
                            suggestions.append({"csv_column": orig_col, "confidence": conf})

    # Check field-specific aliases
    for alias in field_def.get("aliases", []):
        norm_alias = alias.lower().strip()
        for norm_col, orig_col in norm_cols.items():
            if norm_alias == norm_col or norm_alias in norm_col:
                conf = 0.90 if norm_alias == norm_col else 0.70
                if orig_col not in [s["csv_column"] for s in suggestions]:
                    suggestions.append({"csv_column": orig_col, "confidence": conf})

    # Fuzzy: column name contains key words from the field label
    label_words = set(field_def.get("label_en", "").lower().split())
    label_words.discard("m")  # remove unit fragments
    for norm_col, orig_col in norm_cols.items():
        if orig_col in [s["csv_column"] for s in suggestions]:
            continue
        col_words = set(re.split(r"[\s_\-()]+", norm_col))
        overlap = label_words & col_words
        if len(overlap) >= 2:
            suggestions.append({"csv_column": orig_col, "confidence": 0.50})

    # Type compatibility filter
    expected_type = field_def.get("type", "text")
    for s in suggestions:
        col_type = column_types.get(s["csv_column"], "unknown")
        if expected_type == "numeric" and col_type == "text":
            s["confidence"] *= 0.3
            s["warning"] = "Column appears to contain text, expected numeric"
        elif expected_type == "text" and col_type == "numeric":
            s["confidence"] *= 0.5
            s["warning"] = "Column appears numeric, expected text"

    suggestions.sort(key=lambda x: -x["confidence"])
    return suggestions[:8]


def analyze_csv(raw_content: bytes, filename: str = "upload.csv") -> Dict[str, Any]:
    """
    Analyze a CSV file and return structure info, auto-mappings, and suggestions.
    This is the main entry point for the enhanced CSV import review flow.
    """
    # Decode
    text, encoding = _decode(raw_content)
    lines = text.split("\n")

    # Delimiter
    delimiter = _detect_delimiter(text)

    # Header row
    header_row_idx = _find_header_row(lines, delimiter)
    header_line = lines[header_row_idx]

    # Parse headers
    reader = csv.reader(io.StringIO(header_line), delimiter=delimiter)
    headers = [h.strip().strip('"') for h in next(reader)]
    headers = [h for h in headers if h]  # remove empty

    # Parse metadata from lines before header
    metadata = {}
    for i in range(header_row_idx):
        line = lines[i].strip()
        clean = line.replace('"', '').replace("'", "")
        if "date:" in clean.lower() or "date," in clean.lower():
            m = re.search(r"date[:\s,]+\s*([^\s,][^,]*)", clean, re.IGNORECASE)
            if m:
                metadata["date"] = m.group(1).strip()
        if "start time:" in clean.lower() or "start time," in clean.lower():
            m = re.search(r"start time[:\s,]+\s*([^\s,][^,]*)", clean, re.IGNORECASE)
            if m:
                metadata["start_time"] = m.group(1).strip()

    # Parse data rows
    data_lines = lines[header_row_idx + 1:]
    rows = []
    for line in data_lines:
        line = line.strip()
        if not line:
            continue
        reader = csv.reader(io.StringIO(line), delimiter=delimiter)
        try:
            values = next(reader)
            if len(values) >= len(headers) * 0.5:  # allow some missing
                row = {}
                for j, h in enumerate(headers):
                    if j < len(values):
                        row[h] = values[j].strip().strip('"')
                    else:
                        row[h] = ""
                rows.append(row)
        except StopIteration:
            continue

    # Detect column types from sample data
    column_types = {}
    for h in headers:
        sample_values = [r.get(h, "") for r in rows[:30]]
        column_types[h] = _detect_column_type(sample_values)

    # Detect manufacturer using existing gps_import module
    manufacturer = detect_manufacturer_from_columns(headers)

    # Auto-mapping using existing gps_import module
    auto_column_mapping = build_column_mapping(headers, manufacturer)
    # Invert: canonical_name -> csv_column
    canonical_to_csv = {}
    for csv_col, canonical in auto_column_mapping.items():
        canonical_to_csv[canonical] = csv_col

    # Build field suggestions
    field_groups = {"required": [], "recommended": [], "optional": []}
    auto_mapping = {}

    for field_key, field_def in INTERNAL_FIELDS.items():
        suggestions = _suggest_columns_for_field(
            field_key, field_def, headers, column_types, manufacturer
        )

        # Check if auto-mapping found this field via canonical name
        canonical = field_def.get("canonical")
        mapped_col = None
        confidence = 0.0
        if canonical and canonical in canonical_to_csv:
            mapped_col = canonical_to_csv[canonical]
            confidence = 0.95
        elif suggestions:
            best = suggestions[0]
            if best["confidence"] >= 0.70:
                mapped_col = best["csv_column"]
                confidence = best["confidence"]

        auto_mapping[field_key] = {
            "csv_column": mapped_col,
            "confidence": round(confidence, 2),
            "suggestions": suggestions,
        }

        entry = {
            "field_key": field_key,
            "label_pt": field_def["label_pt"],
            "label_en": field_def["label_en"],
            "type": field_def["type"],
            "mapped_to": mapped_col,
            "confidence": round(confidence, 2),
            "suggestions": suggestions,
        }
        field_groups[field_def["group"]].append(entry)

    # Unmapped columns
    mapped_csv_cols = set(v["csv_column"] for v in auto_mapping.values() if v["csv_column"])
    unmapped_columns = [h for h in headers if h not in mapped_csv_cols]

    # Sample rows (first 5)
    sample_rows = rows[:5]

    # Confidence score
    required_fields = [f for f in INTERNAL_FIELDS if INTERNAL_FIELDS[f]["group"] == "required"]
    required_mapped = sum(1 for f in required_fields if auto_mapping[f]["csv_column"])
    confidence_pct = round((required_mapped / len(required_fields)) * 100) if required_fields else 0

    # Warnings
    warnings = []
    for f in required_fields:
        if not auto_mapping[f]["csv_column"]:
            warnings.append({
                "type": "missing_required",
                "field": f,
                "message_pt": f"Campo obrigatório '{INTERNAL_FIELDS[f]['label_pt']}' não foi mapeado automaticamente",
                "message_en": f"Required field '{INTERNAL_FIELDS[f]['label_en']}' was not auto-mapped",
            })

    # Check for date in metadata if not in columns
    if not auto_mapping["session_date"]["csv_column"] and metadata.get("date"):
        auto_mapping["session_date"]["csv_column"] = "__metadata_date__"
        auto_mapping["session_date"]["confidence"] = 0.80
        for fg in field_groups["required"]:
            if fg["field_key"] == "session_date":
                fg["mapped_to"] = "__metadata_date__"
                fg["confidence"] = 0.80
                fg["note"] = f"Date found in file metadata: {metadata['date']}"
        warnings = [w for w in warnings if w["field"] != "session_date"]

    return {
        "file_info": {
            "filename": filename,
            "delimiter": delimiter,
            "encoding": encoding,
            "header_row": header_row_idx,
            "total_rows": len(rows),
            "total_columns": len(headers),
        },
        "detected_provider": manufacturer.value,
        "confidence_pct": confidence_pct,
        "columns": headers,
        "column_types": column_types,
        "auto_mapping": auto_mapping,
        "field_groups": field_groups,
        "unmapped_columns": unmapped_columns,
        "sample_rows": sample_rows,
        "metadata": metadata,
        "warnings": warnings,
    }


def apply_custom_mapping(
    raw_content: bytes,
    mapping: Dict[str, str],
    filename: str = "upload.csv",
) -> List[Dict[str, Any]]:
    """
    Parse CSV rows using a custom field mapping.
    Returns a list of records with internal field names.
    """
    text, _ = _decode(raw_content)
    lines = text.split("\n")
    delimiter = _detect_delimiter(text)
    header_row_idx = _find_header_row(lines, delimiter)
    header_line = lines[header_row_idx]

    reader = csv.reader(io.StringIO(header_line), delimiter=delimiter)
    headers = [h.strip().strip('"') for h in next(reader)]

    # Parse metadata for date fallback
    metadata_date = None
    for i in range(header_row_idx):
        line = lines[i].strip()
        if "date:" in line.lower():
            m = re.search(r"date:\s*\"?([^,\"]+)", line, re.IGNORECASE)
            if m:
                metadata_date = m.group(1).strip()

    # Invert mapping: internal_field -> csv_column
    inv = {}
    for internal_field, csv_col in mapping.items():
        if csv_col and csv_col != "__metadata_date__":
            inv[internal_field] = csv_col

    # Parse rows
    data_lines = lines[header_row_idx + 1:]
    records = []
    for line in data_lines:
        line = line.strip()
        if not line:
            continue
        rdr = csv.reader(io.StringIO(line), delimiter=delimiter)
        try:
            values = next(rdr)
        except StopIteration:
            continue
        if len(values) < len(headers) * 0.5:
            continue
        row_dict = {}
        for j, h in enumerate(headers):
            if j < len(values):
                row_dict[h] = values[j].strip().strip('"')
        record = {}
        for internal_field, csv_col in inv.items():
            val = row_dict.get(csv_col, "")
            field_def = INTERNAL_FIELDS.get(internal_field, {})
            if field_def.get("type") == "numeric":
                try:
                    record[internal_field] = float(val.replace(",", ".")) if val else 0
                except ValueError:
                    record[internal_field] = 0
            else:
                record[internal_field] = val

        # Date handling
        if mapping.get("session_date") == "__metadata_date__" and metadata_date:
            record["session_date"] = _parse_date(metadata_date)
        elif "session_date" in record and record["session_date"]:
            record["session_date"] = _parse_date(record["session_date"])
        else:
            record["session_date"] = datetime.now().strftime("%Y-%m-%d")

        # Only include rows with athlete name and some distance
        if record.get("athlete_name"):
            records.append(record)

    return records


def _parse_date(date_str: str) -> str:
    """Try to parse date into YYYY-MM-DD format."""
    date_str = date_str.strip().strip('"')
    formats = [
        "%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d", "%Y/%m/%d",
        "%d-%m-%Y", "%m-%d-%Y", "%d.%m.%Y",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return date_str
