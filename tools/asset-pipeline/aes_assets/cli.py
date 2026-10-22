"""CLI: bangun semua part dari folder spesifikasi.

Contoh:
    aes-assets                          # semua part (hardware + Tier 2)
    aes-assets --only hw.nut.ms21044n3  # satu part
    aes-assets --skip-tier2             # hardware + alat saja (cepat)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .export import export_part
from .generators import generate
from .spec import SpecError, load_specs
from .tier2 import build_tier2, load_tier2_specs

HERE = Path(__file__).resolve().parent.parent
REPO_ROOT = HERE.parent.parent
DEFAULT_SPECS = HERE / "specs" / "hardware"
DEFAULT_OUT = REPO_ROOT / "packages" / "content" / "assets" / "hardware"
DEFAULT_TOOL_SPECS = HERE / "specs" / "tools"
DEFAULT_TOOL_OUT = REPO_ROOT / "packages" / "content" / "assets" / "tools"
DEFAULT_TIER2_SPECS = HERE / "specs" / "tier2"
DEFAULT_TIER2_OUT = REPO_ROOT / "packages" / "content" / "assets" / "tier2"
# Bentuk dasar sementara untuk part Tier 2 yang mesh AI-nya belum ada; hasilnya ikut folder Tier 2
DEFAULT_PLACEHOLDER_SPECS = HERE / "specs" / "placeholder"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bangun model GLB hardware AES dari spesifikasi.")
    parser.add_argument("--specs", type=Path, default=DEFAULT_SPECS, help="folder spesifikasi JSON")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="folder hasil GLB + metadata")
    parser.add_argument("--tool-specs", type=Path, default=DEFAULT_TOOL_SPECS, help="folder spesifikasi alat (kunci torsi, dll.)")
    parser.add_argument("--tool-out", type=Path, default=DEFAULT_TOOL_OUT, help="folder hasil alat")
    parser.add_argument("--tier2-specs", type=Path, default=DEFAULT_TIER2_SPECS, help="folder spesifikasi Tier 2")
    parser.add_argument("--tier2-out", type=Path, default=DEFAULT_TIER2_OUT, help="folder hasil Tier 2")
    parser.add_argument("--repo-root", type=Path, default=REPO_ROOT, help="akar repo, basis path mesh mentah")
    parser.add_argument("--skip-tier2", action="store_true", help="lewati part Tier 2 (bake makan waktu)")
    parser.add_argument("--only", action="append", default=[], help="ID part tertentu (boleh berulang)")
    args = parser.parse_args(argv)

    try:
        specs = load_specs(args.specs)
        tools = load_specs(args.tool_specs) if args.tool_specs.exists() else []
        placeholders = load_specs(DEFAULT_PLACEHOLDER_SPECS) if DEFAULT_PLACEHOLDER_SPECS.exists() else []
        tier2 = [] if args.skip_tier2 else load_tier2_specs(args.tier2_specs, args.repo_root)
    except SpecError as err:
        print(f"Spesifikasi tidak valid: {err}", file=sys.stderr)
        return 1

    if args.only:
        known = {s.id for s in specs} | {s.id for s in tools} | {s.id for s in tier2} | {s.id for s in placeholders}
        unknown = set(args.only) - known
        if unknown:
            print(f"ID tidak dikenal: {', '.join(sorted(unknown))}", file=sys.stderr)
            return 1
        specs = [s for s in specs if s.id in args.only]
        tools = [s for s in tools if s.id in args.only]
        tier2 = [s for s in tier2 if s.id in args.only]
        placeholders = [s for s in placeholders if s.id in args.only]

    for spec, out in [
        *((s, args.out) for s in specs), *((s, args.tool_out) for s in tools), *((s, args.tier2_out) for s in placeholders),
    ]:
        meta = export_part(spec, generate(spec), out)
        status = "terverifikasi" if spec.source.verified else ("PLACEHOLDER visual" if spec.source.kind == "placeholder" else "BELUM diverifikasi ke standar resmi")
        print(f"{spec.id:24} {meta['triangles']:6d} segitiga  sumber {status}")

    for spec in tier2:
        try:
            meta = build_tier2(spec, args.tier2_out)
        except FileNotFoundError as err:
            print(f"{spec.id:24} DILEWATI: {err}", file=sys.stderr)
            continue
        scale = "skala bersumber" if meta["scale"]["verified"] else "skala PLACEHOLDER"
        print(f"{spec.id:24} {meta['triangles']:6d} segitiga  {scale}")

    print(f"Selesai: {len(specs)} hardware, {len(tools)} alat, {len(tier2)} Tier 2, {len(placeholders)} placeholder")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
