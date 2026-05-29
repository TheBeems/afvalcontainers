#!/usr/bin/env python3

import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / "data/survey/submissions_2026-05-28.csv"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "data/survey/processed"

SUBMISSION_ID_FIELD = "Submission ID"
RESPONDENT_ID_FIELD = "Respondent ID"
SUBMITTED_AT_FIELD = "Submitted at"
ACCEPTABILITY_FIELD = "Vind je de wijziging van restafval ophalen naar zelf wegbrengen acceptabel?"
ACCEPTABLE_REASON_FIELD = "Waarom vind je de wijziging acceptabel?"
NOT_ACCEPTABLE_REASON_FIELD = "Waarom vind je dit niet acceptabel?"
EMAIL_FIELD = "Je e-mail adres wordt alleen gedeeld met de dorpsraad en niet met de gemeente. "
REASON_FLAG_PREFIX = "Waarom vind je dit niet acceptabel? ("
OTHER_REASON_FLAG_FIELD = "Waarom vind je dit niet acceptabel? (Andere reden)"

CORE_FIELDS = [
    RESPONDENT_ID_FIELD,
    SUBMITTED_AT_FIELD,
    "place",
    "street",
    "coverage_status",
    "walking_distance_m",
    "walking_duration_s",
    "container_id",
]

VALID_ACCEPTABILITY_VALUES = {"Ja", "Nee"}
VALID_REASON_FLAG_VALUES = {"", "true", "false"}
DUPLICATE_IGNORED_FIELDS = {SUBMISSION_ID_FIELD, SUBMITTED_AT_FIELD}
TEXT_SEPARATOR_TRIM_RE = re.compile(r"^[\s,;:/|\-]+|[\s,;:/|\-]+$")
WHITESPACE_RE = re.compile(r"\s+")


def cell(value):
    return "" if value is None else value


def normalized(value):
    return cell(value).strip()


def normalized_open_text(value):
    return WHITESPACE_RE.sub(" ", normalized(value))


def parse_args():
    parser = argparse.ArgumentParser(
        description="Clean Tally survey submissions and write local processed outputs."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help=f"Raw survey CSV path. Default: {DEFAULT_INPUT}",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Processed output directory. Default: {DEFAULT_OUTPUT_DIR}",
    )
    return parser.parse_args()


def detect_dialect(input_path):
    sample = input_path.read_text(encoding="utf-8-sig", errors="replace")[:4096]

    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        return csv.excel


def read_records(input_path):
    dialect = detect_dialect(input_path)

    with input_path.open(encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file, dialect=dialect, restval="")
        fields = list(reader.fieldnames or [])
        records = []

        for source_line, row in enumerate(reader, start=2):
            extra_fields = row.pop(None, [])
            records.append({
                "source_line": source_line,
                "row": row,
                "extra_fields": extra_fields,
            })

    return fields, records


def require_columns(fields):
    required_fields = [
        SUBMISSION_ID_FIELD,
        ACCEPTABILITY_FIELD,
        ACCEPTABLE_REASON_FIELD,
        NOT_ACCEPTABLE_REASON_FIELD,
        OTHER_REASON_FLAG_FIELD,
        *CORE_FIELDS,
    ]
    missing_fields = [field for field in required_fields if field not in fields]

    if missing_fields:
        missing_list = ", ".join(missing_fields)
        raise SystemExit(f"Input CSV is missing required columns: {missing_list}")


def reason_flag_fields(fields):
    return [field for field in fields if field.startswith(REASON_FLAG_PREFIX)]


def reason_label(field):
    return field.removeprefix(REASON_FLAG_PREFIX).removesuffix(")")


def fixed_reason_flag_fields(fields):
    return [
        field
        for field in reason_flag_fields(fields)
        if field != OTHER_REASON_FLAG_FIELD
    ]


def validation_reasons(record, fields):
    row = record["row"]
    reasons = []

    if record["extra_fields"]:
        reasons.append(f"extra_fields={len(record['extra_fields'])}")

    missing_core_fields = [field for field in CORE_FIELDS if not normalized(row.get(field))]
    if missing_core_fields:
        reasons.append(f"missing_core_fields={len(missing_core_fields)}")

    if normalized(row.get(ACCEPTABILITY_FIELD)) not in VALID_ACCEPTABILITY_VALUES:
        reasons.append("invalid_acceptability")

    invalid_reason_flags = [
        field
        for field in reason_flag_fields(fields)
        if normalized(row.get(field)) not in VALID_REASON_FLAG_VALUES
    ]
    if invalid_reason_flags:
        reasons.append(f"invalid_reason_flags={len(invalid_reason_flags)}")

    return reasons


def extract_not_acceptable_free_text(row, fields):
    text = normalized_open_text(row.get(NOT_ACCEPTABLE_REASON_FIELD))

    for field in reason_flag_fields(fields):
        text = text.replace(reason_label(field), "")

    text = TEXT_SEPARATOR_TRIM_RE.sub("", text)
    return normalized_open_text(text)


def cleaned_output_row(record, fields):
    row = {
        field: cell(record["row"].get(field))
        for field in fields
    }
    acceptability = normalized(row.get(ACCEPTABILITY_FIELD))

    if acceptability == "Ja":
        row[ACCEPTABLE_REASON_FIELD] = normalized_open_text(row.get(ACCEPTABLE_REASON_FIELD))

    if acceptability == "Nee":
        row[NOT_ACCEPTABLE_REASON_FIELD] = extract_not_acceptable_free_text(row, fields)

    return row


def split_valid_and_quarantined(records, fields):
    valid_records = []
    quarantined_records = []

    for record in records:
        reasons = validation_reasons(record, fields)
        if reasons:
            quarantined_records.append({
                **record,
                "exclusion_reason": "; ".join(reasons),
            })
        else:
            valid_records.append(record)

    return valid_records, quarantined_records


def duplicate_key(record, fields):
    row = record["row"]
    compare_fields = [field for field in fields if field not in DUPLICATE_IGNORED_FIELDS]
    return (
        cell(row.get(RESPONDENT_ID_FIELD)),
        tuple(cell(row.get(field)) for field in compare_fields),
    )


def deduplicate(records, fields):
    kept_records = []
    duplicate_records = []
    groups = defaultdict(list)
    first_by_key = {}

    for record in records:
        key = duplicate_key(record, fields)
        groups[key].append(record)

        if key in first_by_key:
            first_record = first_by_key[key]
            duplicate_records.append({
                **record,
                "exclusion_reason": f"duplicate_of_source_line={first_record['source_line']}",
            })
            continue

        first_by_key[key] = record
        kept_records.append(record)

    duplicate_groups = [
        group
        for group in groups.values()
        if len(group) > 1
    ]

    return kept_records, duplicate_records, duplicate_groups


def output_paths(input_path, output_dir):
    stem = input_path.stem
    return {
        "cleaned": output_dir / f"{stem}.cleaned.csv",
        "excluded": output_dir / f"{stem}.excluded.csv",
        "report": output_dir / f"{stem}.quality-report.md",
    }


def write_cleaned_csv(path, fields, records):
    with path.open("w", encoding="utf-8", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=fields, lineterminator="\n")
        writer.writeheader()

        for record in records:
            writer.writerow(cleaned_output_row(record, fields))


def write_excluded_csv(path, fields, records):
    excluded_fields = [
        "source_line",
        "exclusion_reason",
        *fields,
        "extra_fields",
    ]

    with path.open("w", encoding="utf-8", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=excluded_fields, lineterminator="\n")
        writer.writeheader()

        for record in records:
            row = {
                "source_line": record["source_line"],
                "exclusion_reason": record["exclusion_reason"],
                "extra_fields": json.dumps(record["extra_fields"], ensure_ascii=False),
            }
            row.update({field: cell(record["row"].get(field)) for field in fields})
            writer.writerow(row)


def acceptability_counts(records):
    return Counter(normalized(record["row"].get(ACCEPTABILITY_FIELD)) for record in records)


def cleaned_open_text_counts(records, fields):
    counts = Counter()

    for record in records:
        row = cleaned_output_row(record, fields)
        acceptability = normalized(row.get(ACCEPTABILITY_FIELD))

        if acceptability == "Ja" and normalized(row.get(ACCEPTABLE_REASON_FIELD)):
            counts["acceptable_reason_text"] += 1

        if acceptability == "Nee" and normalized(row.get(NOT_ACCEPTABLE_REASON_FIELD)):
            counts["not_acceptable_other_reason_text"] += 1

    return counts


def fixed_reason_mismatch_count(records, fields):
    mismatch_count = 0

    for record in records:
        row = record["row"]
        if normalized(row.get(ACCEPTABILITY_FIELD)) != "Nee":
            continue

        text = normalized_open_text(row.get(NOT_ACCEPTABLE_REASON_FIELD))
        has_mismatch = any(
            (normalized(row.get(field)) == "true") != (reason_label(field) in text)
            for field in fixed_reason_flag_fields(fields)
        )

        if has_mismatch:
            mismatch_count += 1

    return mismatch_count


def multi_email_respondent_count(records):
    if not records or EMAIL_FIELD not in records[0]["row"]:
        return 0

    emails_by_respondent = defaultdict(set)
    for record in records:
        respondent_id = normalized(record["row"].get(RESPONDENT_ID_FIELD))
        email = normalized(record["row"].get(EMAIL_FIELD)).lower()
        if respondent_id and email:
            emails_by_respondent[respondent_id].add(email)

    return sum(1 for emails in emails_by_respondent.values() if len(emails) > 1)


def format_line_list(records):
    return ", ".join(str(record["source_line"]) for record in records) or "-"


def format_duplicate_group(group):
    source_lines = [record["source_line"] for record in group]
    dropped_lines = source_lines[1:]
    return (
        f"- {', '.join(str(line) for line in source_lines)} "
        f"(keep {source_lines[0]}; drop {', '.join(str(line) for line in dropped_lines)})"
    )


def write_report(
    path,
    input_path,
    paths,
    records,
    valid_records,
    quarantined_records,
    duplicate_records,
    duplicate_groups,
    cleaned_records,
    fields,
):
    counts = acceptability_counts(cleaned_records)
    open_text_counts = cleaned_open_text_counts(cleaned_records, fields)
    quarantined_by_reason = Counter(record["exclusion_reason"] for record in quarantined_records)
    mismatch_count = fixed_reason_mismatch_count(cleaned_records, fields)

    lines = [
        "# Survey quality report",
        "",
        "This report intentionally excludes personal data and raw open-text answers.",
        "",
        "## Files",
        f"- Input: `{input_path}`",
        f"- Cleaned CSV: `{paths['cleaned']}`",
        f"- Excluded CSV: `{paths['excluded']}`",
        "",
        "## Rules",
        "- Quarantine records with extra fields, invalid acceptability values, invalid reason flags, or missing core fields before deduplication.",
        "- Deduplicate only within the same Respondent ID.",
        "- Compare all fields exactly except Submission ID and Submitted at.",
        "- Keep the first record in CSV order and exclude later duplicates.",
        "- Multiple email addresses for the same Respondent ID are allowed by themselves.",
        "- In the cleaned CSV, the main not-acceptable reason column contains only extracted free text.",
        "",
        "## Counts",
        f"- Raw CSV records: {len(records)}",
        f"- Quarantined before deduplication: {len(quarantined_records)}",
        f"- Valid before deduplication: {len(valid_records)}",
        f"- Duplicate groups: {len(duplicate_groups)}",
        f"- Duplicate records removed: {len(duplicate_records)}",
        f"- Cleaned records: {len(cleaned_records)}",
        "",
        "## Acceptability after cleaning",
        f"- Ja: {counts.get('Ja', 0)}",
        f"- Nee: {counts.get('Nee', 0)}",
        "",
        "## Open text after cleaning",
        f"- Acceptable open-text answers: {open_text_counts.get('acceptable_reason_text', 0)}",
        f"- Not-acceptable free other-reason answers: {open_text_counts.get('not_acceptable_other_reason_text', 0)}",
        f"- Fixed-reason mismatch rows before text extraction: {mismatch_count}",
        "",
        "## Quarantined records",
        f"- Source lines: {format_line_list(quarantined_records)}",
    ]

    for reason, count in sorted(quarantined_by_reason.items()):
        lines.append(f"- {reason}: {count}")

    lines.extend([
        "",
        "## Duplicate groups",
    ])

    if duplicate_groups:
        lines.extend(format_duplicate_group(group) for group in duplicate_groups)
    else:
        lines.append("- None")

    lines.extend([
        "",
        "## Multi-email handling",
        f"- Respondent IDs with more than one non-empty email address in the raw CSV: {multi_email_respondent_count(records)}",
        "- These are not removed unless the full deduplication key is equal.",
        "",
        "Note: source lines are CSV record numbers with the header counted as line 1.",
        "",
    ])

    path.write_text("\n".join(lines), encoding="utf-8")


def main():
    args = parse_args()
    input_path = args.input.resolve()
    output_dir = args.output_dir.resolve()

    if not input_path.exists():
        raise SystemExit(f"Input CSV does not exist: {input_path}")

    fields, records = read_records(input_path)
    require_columns(fields)

    valid_records, quarantined_records = split_valid_and_quarantined(records, fields)
    cleaned_records, duplicate_records, duplicate_groups = deduplicate(valid_records, fields)
    excluded_records = [*quarantined_records, *duplicate_records]
    paths = output_paths(input_path, output_dir)

    output_dir.mkdir(parents=True, exist_ok=True)
    write_cleaned_csv(paths["cleaned"], fields, cleaned_records)
    write_excluded_csv(paths["excluded"], fields, excluded_records)
    write_report(
        paths["report"],
        input_path,
        paths,
        records,
        valid_records,
        quarantined_records,
        duplicate_records,
        duplicate_groups,
        cleaned_records,
        fields,
    )

    counts = acceptability_counts(cleaned_records)
    print(f"Raw CSV records: {len(records)}")
    print(f"Quarantined before deduplication: {len(quarantined_records)}")
    print(f"Duplicate groups: {len(duplicate_groups)}")
    print(f"Duplicate records removed: {len(duplicate_records)}")
    print(f"Cleaned records: {len(cleaned_records)}")
    print(f"Acceptability after cleaning: Ja={counts.get('Ja', 0)}, Nee={counts.get('Nee', 0)}")
    open_text_counts = cleaned_open_text_counts(cleaned_records, fields)
    print(
        "Open text after cleaning: "
        f"acceptable={open_text_counts.get('acceptable_reason_text', 0)}, "
        f"not_acceptable_other={open_text_counts.get('not_acceptable_other_reason_text', 0)}"
    )
    print(f"Wrote: {paths['cleaned']}")
    print(f"Wrote: {paths['excluded']}")
    print(f"Wrote: {paths['report']}")


if __name__ == "__main__":
    main()
