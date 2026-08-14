#!/usr/bin/env python3

import argparse
import csv
import statistics
from collections import Counter, defaultdict
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / "data/survey/processed/submissions_2026-08-14.cleaned.csv"
DEFAULT_OUTPUT = PROJECT_ROOT / "data/survey/processed/submissions_2026-08-14.analysis-report.md"

SMALL_COUNT_THRESHOLD = 1
TOP_LIMIT = 15

ACCEPTABILITY_FIELD = "Vind je de wijziging van restafval ophalen naar zelf wegbrengen acceptabel?"
ACCEPTABLE_REASON_FIELD = "Waarom vind je de wijziging acceptabel?"
NOT_ACCEPTABLE_REASON_FIELD = "Waarom vind je dit niet acceptabel?"
REASON_FLAG_PREFIX = "Waarom vind je dit niet acceptabel? ("

REQUIRED_FIELDS = [
    "coverage_status",
    "street",
    "walking_distance_m",
    "walking_duration_s",
    "container_id",
    ACCEPTABILITY_FIELD,
    ACCEPTABLE_REASON_FIELD,
    NOT_ACCEPTABLE_REASON_FIELD,
]

COVERAGE_STATUS_ORDER = [
    "within_100",
    "between_100_125",
    "between_125_150",
    "between_150_275",
    "over_275",
    "unreachable",
]

COVERAGE_STATUS_LABELS = {
    "within_100": "0-100 m",
    "between_100_125": "100-125 m",
    "between_125_150": "125-150 m",
    "between_150_275": "150-275 m",
    "over_275": ">275 m",
    "unreachable": "Onbereikbaar",
}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Analyze cleaned survey submissions and write an aggregate Markdown report."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help=f"Cleaned survey CSV path. Default: {DEFAULT_INPUT}",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Markdown report path. Default: {DEFAULT_OUTPUT}",
    )
    return parser.parse_args()


def normalized(value):
    return "" if value is None else value.strip()


def read_rows(input_path):
    if not input_path.exists():
        raise SystemExit(f"Cleaned CSV does not exist: {input_path}")

    with input_path.open(encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        fields = list(reader.fieldnames or [])
        rows = list(reader)

    require_columns(fields)
    return fields, rows


def require_columns(fields):
    missing_fields = [field for field in REQUIRED_FIELDS if field not in fields]
    if missing_fields:
        missing_list = ", ".join(missing_fields)
        raise SystemExit(f"Cleaned CSV is missing required columns: {missing_list}")

    if not reason_flag_fields(fields):
        raise SystemExit("Cleaned CSV is missing not-acceptable reason flag columns.")


def reason_flag_fields(fields):
    return [field for field in fields if field.startswith(REASON_FLAG_PREFIX)]


def reason_label(field):
    return field.removeprefix(REASON_FLAG_PREFIX).removesuffix(")")


def parse_number(row, field, line_number):
    value = normalized(row.get(field))
    if not value:
        raise SystemExit(f"Missing numeric value in {field} at CSV line {line_number}.")

    try:
        return float(value)
    except ValueError:
        raise SystemExit(f"Invalid numeric value in {field} at CSV line {line_number}: {value}")


def numeric_values(rows, field):
    return [
        parse_number(row, field, line_number)
        for line_number, row in enumerate(rows, start=2)
    ]


def format_decimal(value, decimals=1):
    rounded = round(value, decimals)
    if rounded == int(rounded):
        return str(int(rounded))
    return f"{rounded:.{decimals}f}".replace(".", ",")


def format_percent(part, total):
    if total == 0:
        return ""
    return f"{format_decimal(part * 100 / total)}%"


def format_count(value):
    if 0 < value < SMALL_COUNT_THRESHOLD:
        return f"n<{SMALL_COUNT_THRESHOLD}"
    return str(value)


def has_suppressed_acceptability_cell(counts):
    return any(
        0 < counts.get(value, 0) < SMALL_COUNT_THRESHOLD
        for value in ("Ja", "Nee")
    )


def markdown_table(headers, rows):
    if not rows:
        return "_Geen rijen._"

    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    lines.extend("| " + " | ".join(str(cell) for cell in row) + " |" for row in rows)
    return "\n".join(lines)


def threshold_label():
    unit = "reactie" if SMALL_COUNT_THRESHOLD == 1 else "reacties"
    return f"minimaal {SMALL_COUNT_THRESHOLD} {unit}"


def privacy_rule_lines():
    if SMALL_COUNT_THRESHOLD <= 1:
        return [
            "- Alle groepen met minimaal 1 reactie worden afzonderlijk getoond.",
            "- Ja/Nee-cellen worden niet onderdrukt.",
        ]

    return [
        f"- Groepen met minder dan {SMALL_COUNT_THRESHOLD} reacties worden niet afzonderlijk getoond.",
        f"- Ja/Nee-cellen tussen 1 en {SMALL_COUNT_THRESHOLD - 1} worden getoond als `n<{SMALL_COUNT_THRESHOLD}`.",
        "- Bij een onderdrukte Ja/Nee-cel blijft het percentage voor die rij leeg.",
    ]


def acceptability_counts(rows):
    return Counter(normalized(row.get(ACCEPTABILITY_FIELD)) for row in rows)


def grouped_acceptability_counts(rows, field):
    grouped = defaultdict(Counter)
    for row in rows:
        grouped[normalized(row.get(field))][normalized(row.get(ACCEPTABILITY_FIELD))] += 1
    return grouped


def total_for_counts(counts):
    return counts.get("Ja", 0) + counts.get("Nee", 0)


def acceptability_row(label, counts):
    total = total_for_counts(counts)
    suppressed = has_suppressed_acceptability_cell(counts)
    return [
        label,
        total,
        format_count(counts.get("Ja", 0)),
        format_count(counts.get("Nee", 0)),
        "" if suppressed else format_percent(counts.get("Nee", 0), total),
    ]


def numeric_summary_rows(rows):
    distance_values = numeric_values(rows, "walking_distance_m")
    duration_values = numeric_values(rows, "walking_duration_s")
    summaries = [
        ("Loopafstand (m)", distance_values),
        ("Looptijd (s)", duration_values),
    ]

    return [
        [
            label,
            format_decimal(min(values)),
            format_decimal(statistics.median(values)),
            format_decimal(statistics.mean(values)),
            format_decimal(max(values)),
        ]
        for label, values in summaries
    ]


def coverage_rows(rows):
    grouped = grouped_acceptability_counts(rows, "coverage_status")
    ordered_statuses = [
        status
        for status in COVERAGE_STATUS_ORDER
        if status in grouped
    ]
    ordered_statuses.extend(
        sorted(status for status in grouped if status not in COVERAGE_STATUS_ORDER)
    )

    return [
        acceptability_row(COVERAGE_STATUS_LABELS.get(status, status), grouped[status])
        for status in ordered_statuses
    ]


def reason_flag_rows(rows, fields):
    no_rows = [
        row
        for row in rows
        if normalized(row.get(ACCEPTABILITY_FIELD)) == "Nee"
    ]
    no_total = len(no_rows)
    reason_rows = []

    for field in reason_flag_fields(fields):
        count = sum(1 for row in no_rows if normalized(row.get(field)) == "true")
        reason_rows.append([
            reason_label(field),
            count,
            format_percent(count, no_total),
        ])

    return sorted(reason_rows, key=lambda row: (-row[1], row[0]))


def selected_reason_labels(row, fields):
    return [
        reason_label(field)
        for field in reason_flag_fields(fields)
        if normalized(row.get(field)) == "true"
    ]


def reason_combination_rows(rows, fields):
    counts = Counter()
    for row in rows:
        if normalized(row.get(ACCEPTABILITY_FIELD)) == "Nee":
            counts[tuple(selected_reason_labels(row, fields))] += 1

    return [
        [" + ".join(labels), count]
        for labels, count in counts.most_common()
        if count >= SMALL_COUNT_THRESHOLD
    ][:TOP_LIMIT]


def reason_pair_rows(rows, fields):
    counts = Counter()
    for row in rows:
        if normalized(row.get(ACCEPTABILITY_FIELD)) != "Nee":
            continue

        labels = selected_reason_labels(row, fields)
        for index, first_label in enumerate(labels):
            for second_label in labels[index + 1:]:
                counts[(first_label, second_label)] += 1

    return [
        [f"{first_label} + {second_label}", count]
        for (first_label, second_label), count in counts.most_common()
        if count >= SMALL_COUNT_THRESHOLD
    ][:TOP_LIMIT]


def visible_group_rows(rows, field):
    grouped = grouped_acceptability_counts(rows, field)
    visible = {
        label: counts
        for label, counts in grouped.items()
        if total_for_counts(counts) >= SMALL_COUNT_THRESHOLD
    }
    suppressed = {
        label: counts
        for label, counts in grouped.items()
        if total_for_counts(counts) < SMALL_COUNT_THRESHOLD
    }
    table_rows = [
        acceptability_row(label, counts)
        for label, counts in sorted(
            visible.items(),
            key=lambda item: (-total_for_counts(item[1]), item[0]),
        )
    ]

    suppressed_response_count = sum(total_for_counts(counts) for counts in suppressed.values())
    return table_rows, len(grouped), len(visible), len(suppressed), suppressed_response_count


def open_text_counts(rows):
    return {
        "acceptable": sum(
            1
            for row in rows
            if normalized(row.get(ACCEPTABILITY_FIELD)) == "Ja"
            and normalized(row.get(ACCEPTABLE_REASON_FIELD))
        ),
        "not_acceptable_other": sum(
            1
            for row in rows
            if normalized(row.get(ACCEPTABILITY_FIELD)) == "Nee"
            and normalized(row.get(NOT_ACCEPTABLE_REASON_FIELD))
        ),
    }


def write_report(output_path, input_path, fields, rows):
    counts = acceptability_counts(rows)
    total = total_for_counts(counts)
    open_counts = open_text_counts(rows)
    container_rows, container_total, container_visible, container_suppressed, container_suppressed_responses = visible_group_rows(rows, "container_id")
    street_rows, street_total, street_visible, street_suppressed, street_suppressed_responses = visible_group_rows(rows, "street")

    lines = [
        "# Eerste kwantitatieve enqueteanalyse",
        "",
        f"Bron: `{input_path}`",
        "",
        "Dit rapport toont alleen geaggregeerde tellingen en percentages. Open antwoorden, e-mailadressen, respondent-id's en submission-id's worden niet getoond.",
        "",
        "## Samenvatting",
        f"- Reacties: {total}",
        f"- Ja: {counts.get('Ja', 0)} ({format_percent(counts.get('Ja', 0), total)})",
        f"- Nee: {counts.get('Nee', 0)} ({format_percent(counts.get('Nee', 0), total)})",
        "",
        "## Afstand en looptijd",
        markdown_table(
            ["Maat", "Min", "Mediaan", "Gemiddelde", "Max"],
            numeric_summary_rows(rows),
        ),
        "",
        "## Acceptatie per afstandsband",
        markdown_table(
            ["Afstandsband", "Totaal", "Ja", "Nee", "% Nee"],
            coverage_rows(rows),
        ),
        "",
        "## Redenvlaggen bij Nee",
        markdown_table(
            ["Reden", "Aantal", "% van Nee"],
            reason_flag_rows(rows, fields),
        ),
        "",
        "## Top redencombinaties",
        markdown_table(
            ["Combinatie", "Aantal"],
            reason_combination_rows(rows, fields),
        ),
        "",
        "## Top redenparen",
        markdown_table(
            ["Paar", "Aantal"],
            reason_pair_rows(rows, fields),
        ),
        "",
        f"## Containers met {threshold_label()}",
        f"- Containergroepen totaal: {container_total}",
        f"- Getoond: {container_visible}",
        f"- Onderdrukt: {container_suppressed} groepen, {container_suppressed_responses} reacties",
        "",
        markdown_table(
            ["Container", "Totaal", "Ja", "Nee", "% Nee"],
            container_rows,
        ),
        "",
        f"## Straten met {threshold_label()}",
        f"- Straatgroepen totaal: {street_total}",
        f"- Getoond: {street_visible}",
        f"- Onderdrukt: {street_suppressed} groepen, {street_suppressed_responses} reacties",
        "",
        markdown_table(
            ["Straat", "Totaal", "Ja", "Nee", "% Nee"],
            street_rows,
        ),
        "",
        "## Open tekst",
        f"- Ja-open-antwoorden: {open_counts['acceptable']}",
        f"- Vrije 'Andere reden'-teksten bij Nee: {open_counts['not_acceptable_other']}",
        "- De tekst zelf is niet opgenomen in dit rapport.",
        "",
        "## Privacyregels",
        *privacy_rule_lines(),
        "",
    ]

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines), encoding="utf-8")


def main():
    args = parse_args()
    input_path = args.input.resolve()
    output_path = args.output.resolve()
    fields, rows = read_rows(input_path)

    write_report(output_path, input_path, fields, rows)
    counts = acceptability_counts(rows)
    print(f"Reacties: {total_for_counts(counts)}")
    print(f"Ja: {counts.get('Ja', 0)}")
    print(f"Nee: {counts.get('Nee', 0)}")
    print(f"Wrote: {output_path}")


if __name__ == "__main__":
    main()
