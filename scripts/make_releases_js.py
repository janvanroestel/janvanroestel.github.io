"""Convert data/releases.csv into data/releases.js for the timeline page.

Usage:
    ~/miniconda3/bin/python scripts/make_releases_js.py --reviewed YYYY-MM-DD

``--reviewed`` is the date the sources were last checked by a person or agent.
It is required on purpose; it is not the export date.
"""
from __future__ import annotations

import argparse
import csv
import json
import logging
from datetime import date
from pathlib import Path

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "releases.csv"
OUT_PATH = ROOT / "data" / "releases.js"

REQUIRED = ["survey", "release", "date_start", "date_end", "date_status",
            "category", "source_url", "notes", "date_kind", "evidence",
            "event_type", "access"]
ALLOWED: dict[str, set[str]] = {
    "date_status": {"confirmed", "target", "projected"},
    "date_kind": {"exact", "window", "lower_bound", "ongoing", "undated"},
    "evidence": {"official", "secondary"},
    "event_type": {"data_release", "alert_stream", "launch", "milestone", "paper"},
    "access": {"public", "restricted"},
}

# Filter tags per survey. Chips are multi-select (OR logic).
# 'alerts' is added per row for event_type == alert_stream (public alert streams).
SURVEY_BANDS: dict[str, list[str]] = {
    "4most": ["optical", "spectroscopic"],
    "hsc-ssp": ["optical", "photometric"],
    "neowise": ["IR", "photometric", "time-domain"],
    "chandra": ["high-energy"],
    "xmm-newton": ["high-energy"],
    "ska": ["radio"],
    "moons": ["optical", "IR", "spectroscopic"],
    "vlass": ["radio", "time-domain"],
    "lvk": ["time-domain"],
    "fermi-lat": ["high-energy"],
    "hetdex": ["optical", "spectroscopic"],
    "galah": ["optical", "spectroscopic"],
    "panstarrs": ["optical", "photometric", "time-domain"],
    "pfs": ["optical", "IR", "spectroscopic"],
    "argus-array": ["optical", "photometric", "time-domain"],
    "atlas": ["optical", "photometric", "time-domain"],
    "blackgem": ["optical", "photometric", "time-domain"],
    "ls4": ["optical", "photometric", "time-domain"],
    "uvex": ["UV", "photometric", "time-domain"],
    "weave": ["optical", "spectroscopic"],
    "askap": ["radio", "time-domain"],
    "chime": ["radio", "time-domain"],
    "des": ["optical", "photometric"],
    "desi": ["optical", "spectroscopic"],
    "einstein-probe": ["high-energy", "time-domain"],
    "erosita": ["high-energy", "photometric"],
    "euclid": ["optical", "IR", "photometric", "spectroscopic"],
    "gaia": ["optical", "photometric", "spectroscopic", "astrometry", "time-domain"],
    "kids": ["optical", "IR", "photometric"],
    "lamost": ["optical", "spectroscopic"],
    "lofar-lotss": ["radio", "photometric"],
    "meerkat": ["radio", "photometric"],
    "plato": ["optical", "photometric", "time-domain"],
    "roman": ["optical", "IR", "photometric", "spectroscopic"],
    "rubin-lsst": ["optical", "photometric", "time-domain"],
    "sdss-v": ["optical", "IR", "spectroscopic"],
    "spherex": ["IR", "spectroscopic"],
    "xrism": ["high-energy", "spectroscopic"],
    "ztf": ["optical", "photometric", "time-domain"],
}

SURVEY_NAMES: dict[str, str] = {
    "hsc-ssp": "HSC-SSP", "neowise": "NEOWISE", "chandra": "Chandra", "xmm-newton": "XMM-Newton",
    "ska": "SKA", "moons": "MOONS", "vlass": "VLASS", "lvk": "LIGO-Virgo-KAGRA",
    "fermi-lat": "Fermi-LAT", "hetdex": "HETDEX", "galah": "GALAH",
    "4most": "4MOST", "panstarrs": "Pan-STARRS", "pfs": "PFS", "argus-array": "Argus Array", "atlas": "ATLAS", "blackgem": "BlackGEM",
    "ls4": "LS4", "uvex": "UVEX", "weave": "WEAVE",
    "askap": "ASKAP/VAST", "chime": "CHIME/FRB", "des": "DES", "desi": "DESI",
    "einstein-probe": "Einstein Probe", "erosita": "eROSITA", "euclid": "Euclid",
    "gaia": "Gaia", "kids": "KiDS", "lamost": "LAMOST", "lofar-lotss": "LOFAR LoTSS",
    "meerkat": "MeerKAT", "plato": "PLATO", "roman": "Roman", "rubin-lsst": "Rubin LSST",
    "sdss-v": "SDSS-V", "spherex": "SPHEREx", "xrism": "XRISM", "ztf": "ZTF",
}


def parse_row(row: dict[str, str], line: int) -> dict[str, object]:
    """Validate one CSV row and return its output record."""
    missing = [k for k in REQUIRED if k not in row]
    if missing:
        raise ValueError(f"line {line}: missing columns {missing}")
    for key, allowed in ALLOWED.items():
        if row[key] not in allowed:
            raise ValueError(f"line {line}: {key}={row[key]!r} not in {sorted(allowed)}")
    if row["survey"] not in SURVEY_BANDS:
        raise ValueError(f"line {line}: survey {row['survey']!r} has no band tags")
    kind = row["date_kind"]
    start = date.fromisoformat(row["date_start"]) if row["date_start"] else None
    end = date.fromisoformat(row["date_end"]) if row["date_end"] else None
    if kind == "undated":
        if start is not None or end is not None:
            raise ValueError(f"line {line}: undated rows must have no dates")
    else:
        if start is None:
            raise ValueError(f"line {line}: date_start required for date_kind={kind!r}")
        if end is not None and end < start:
            raise ValueError(f"line {line}: date_end before date_start")
    if kind == "window" and end is None:
        raise ValueError(f"line {line}: window without date_end")
    if kind in ("exact", "lower_bound", "ongoing") and end is not None:
        raise ValueError(f"line {line}: date_end set but date_kind={kind!r}")
    if not row["source_url"].startswith("https://"):
        raise ValueError(f"line {line}: source_url is not https")
    bands = list(SURVEY_BANDS[row["survey"]])
    if row["event_type"] == "alert_stream":
        bands.append("alerts")
    return {
        "survey": SURVEY_NAMES[row["survey"]],
        "survey_id": row["survey"],
        "release": row["release"],
        "start": row["date_start"] or None,
        "end": row["date_end"] or None,
        "kind": kind,
        "status": row["date_status"],
        "evidence": row["evidence"],
        "event": row["event_type"],
        "access": row["access"],
        "bands": bands,
        "url": row["source_url"],
        "notes": row["notes"],
    }


def build(reviewed: str) -> None:
    date.fromisoformat(reviewed)  # fail early on a bad date
    with CSV_PATH.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        records = [parse_row(r, i + 2) for i, r in enumerate(reader)]
    keys = [(r["survey_id"], r["release"]) for r in records]
    if len(set(keys)) != len(keys):
        raise SystemExit("Duplicate (survey, release) pairs in releases.csv")
    js = (
        "// Generated by scripts/make_releases_js.py from data/releases.csv. Do not edit.\n"
        f"const LAST_REVIEWED = {json.dumps(reviewed)};\n"
        f"const RELEASES = {json.dumps(records, indent=1, ensure_ascii=False)};\n"
    )
    OUT_PATH.write_text(js, encoding="utf-8")
    logger.info("Wrote %d releases to %s", len(records), OUT_PATH)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--reviewed", required=True, help="YYYY-MM-DD the sources were last checked")
    build(p.parse_args().reviewed)


if __name__ == "__main__":
    main()
