#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path


# 需求1
# 把 excel 导出的文件名称 + 固定签名字符做 md5，作为新的 bin 文件名。
# 例如：consts.bin -> md5("consts" + SIGN) + ".bin"
#
# 需求2
# 把生成的 schema.ts 中，对应表名字符串同步替换成新的哈希值。
#
# 说明
# 当前项目通过 static bind(tb) 返回对象的 key 作为表名绑定入口。
# 脚本会从 bind(tb) 的对象 key 中提取原始表名，并同步替换成哈希名。
#
# 关联文件
# ----------------------------------------------------------------------
# 数据脚本执行入口: data/excel_import.sh
# 数据二进制文件路径: assets/cfgs
# 数据代码文件: src/game/cfgs/schema.ts

SIGN = "eggbbq.com"
ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "assets" / "data" / "cfgs"
SCHEMA_FILE = ROOT / "src" / "game" / "cfgs" / "schema.ts"
HASH_RE = re.compile(r"^[0-9a-f]{32}$")
BIND_RE = re.compile(
    r"(^[ \t]*static\s+bind\s*\(\s*tb\s*:\s*\w+\s*\)\s*:\s*Record<string,\s*\(data:\s*ByteBuf\)\s*=>\s*void>\s*\{\s*^[ \t]*return\s*\{\s*)(.*?)(\s*^[ \t]*\}\s*;\s*^[ \t]*\})",
    re.DOTALL | re.MULTILINE,
)


def main() -> int:
    if not DATA_DIR.is_dir():
        print(f"[Error] Data directory not found: {DATA_DIR}", file=sys.stderr)
        return 1

    if not SCHEMA_FILE.is_file():
        print(f"[Error] Schema file not found: {SCHEMA_FILE}", file=sys.stderr)
        return 1

    schema_content = SCHEMA_FILE.read_text(encoding="utf-8")
    table_names = parse_table_names(schema_content)
    if not table_names:
        print(f"[Warn] No table names found in {SCHEMA_FILE}")
        return 0

    mapping = build_name_mapping(table_names)
    if is_already_processed(mapping):
        print("[Info] schema.ts already uses hashed table names, skip post process.")
        return 0

    rename_generated_files(mapping)
    updated_schema = rewrite_schema(schema_content, mapping)

    if updated_schema != schema_content:
        SCHEMA_FILE.write_text(updated_schema, encoding="utf-8")

    print("[Done] Post processed excel output:")
    for original_name, hashed_name in mapping.items():
        print(f"  {original_name} -> {hashed_name}")
    return 0


def parse_table_names(content: str) -> list[str]:
    bind_match = BIND_RE.search(content)
    if not bind_match:
        return []

    items = re.findall(r"(['\"])([^'\"]+)\1\s*:", bind_match.group(2))
    return [name for _, name in items]


def build_name_mapping(table_names: list[str]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for table_name in table_names:
        if HASH_RE.fullmatch(table_name):
            mapping[table_name] = table_name
            continue
        mapping[table_name] = hashlib.md5(f"{table_name}{SIGN}".encode("utf-8")).hexdigest()
    return mapping


def is_already_processed(mapping: dict[str, str]) -> bool:
    if not mapping:
        return False
    return all(original_name == hashed_name for original_name, hashed_name in mapping.items())


def rename_generated_files(mapping: dict[str, str]) -> None:
    for original_name, hashed_name in mapping.items():
        if original_name == hashed_name:
            continue

        rename_one(DATA_DIR / f"{original_name}.bin", DATA_DIR / f"{hashed_name}.bin")
        rename_one(DATA_DIR / f"{original_name}.bin.meta", DATA_DIR / f"{hashed_name}.bin.meta")


def rename_one(source: Path, target: Path) -> None:
    if source == target:
        return
    if not source.exists():
        if target.exists():
            return
        print(f"[Warn] File not found, skip rename: {source}")
        return
    if target.exists():
        target.unlink()
    source.rename(target)


def rewrite_schema(content: str, mapping: dict[str, str]) -> str:
    table_names = parse_table_names(content)
    if not table_names:
        return content

    updated = content

    bind_match = BIND_RE.search(updated)
    if bind_match:
        rewritten_body = bind_match.group(2)
        for original_name, hashed_name in mapping.items():
            rewritten_body = re.sub(
                rf"((['\"]))({re.escape(original_name)})(\2\s*:)",
                lambda found: f"{found.group(1)}{hashed_name}{found.group(4)}",
                rewritten_body,
            )
        updated = updated[: bind_match.start()] + bind_match.group(1) + rewritten_body + bind_match.group(3) + updated[bind_match.end() :]

    return updated


if __name__ == "__main__":
    raise SystemExit(main())
