#!/usr/bin/env python3

import argparse
import csv
from collections import Counter
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / "data/survey/processed/submissions_2026-05-28.thematic-coding.csv"
DEFAULT_OUTPUT = PROJECT_ROOT / "data/survey/processed/submissions_2026-05-28.thematic-report.md"

THEME_LABELS = {
    "distance_or_accessibility": "Afstand en toegankelijkheid",
    "elderly_disabled_health": "Ouderen, beperking en gezondheid",
    "families_luiers_pets_heavy_waste": "Gezinnen, luiers, huisdieren en zwaar afval",
    "litter_overflow_defects_maintenance": "Bijplaatsingen, volle/defecte containers en onderhoud",
    "hygiene_stench_pests_storage": "Hygiene, stank, ongedierte en opslag thuis",
    "costs_fees_pay_per_bag": "Kosten, heffingen en betalen per zak/lediging",
    "service_loss_unnecessary_investment": "Serviceverlies, nut/noodzaak en investering",
    "waste_separation_environment": "Afvalscheiding, milieu en restafvalvermindering",
    "traffic_safety_car_use_parking": "Verkeer, veiligheid, autogebruik en parkeren",
    "location_street_scene_nature": "Locatie, straatbeeld, natuur en openbare ruimte",
    "paper_container_vios_associations": "Papiercontainer, VIOS en verenigingen",
    "convenience_flexibility": "Gemak en flexibiliteit",
    "few_residual_waste_good_separation": "Laag restafvalvolume en goede scheiding",
    "habit_acceptance_no_problem": "Gewenning, acceptatie en geen probleem",
    "governance_participation_legal": "Bestuur, participatie en juridische argumenten",
    "other_unclear": "Overig of onduidelijk",
}

REQUIRED_FIELDS = [
    "answer_id",
    "cleaned_row_number",
    "answer_group",
    "acceptability",
    "primary_theme",
    "themes",
    "needs_review",
    "review_reason",
]


def parse_args():
    parser = argparse.ArgumentParser(
        description="Summarize local thematic coding into an aggregate Markdown report."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help=f"Thematic coding CSV path. Default: {DEFAULT_INPUT}",
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
        raise SystemExit(f"Thematic coding CSV does not exist: {input_path}")

    with input_path.open(encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        fields = list(reader.fieldnames or [])
        rows = list(reader)

    missing_fields = [field for field in REQUIRED_FIELDS if field not in fields]
    if missing_fields:
        raise SystemExit(f"Thematic coding CSV is missing required columns: {', '.join(missing_fields)}")

    return rows


def split_themes(value):
    return [
        theme
        for theme in normalized(value).split("|")
        if theme
    ]


def format_percent(part, total):
    if total == 0:
        return ""
    value = round(part * 100 / total, 1)
    if value == int(value):
        return f"{int(value)}%"
    return f"{value:.1f}%".replace(".", ",")


def markdown_table(headers, rows):
    if not rows:
        return "_Geen rijen._"

    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    lines.extend("| " + " | ".join(str(cell) for cell in row) + " |" for row in rows)
    return "\n".join(lines)


def answer_counts(rows):
    counts = Counter(row["acceptability"] for row in rows)
    return {
        "total": len(rows),
        "Ja": counts.get("Ja", 0),
        "Nee": counts.get("Nee", 0),
    }


def theme_counts(rows):
    total_counts = Counter()
    yes_counts = Counter()
    no_counts = Counter()

    for row in rows:
        for theme in split_themes(row["themes"]):
            total_counts[theme] += 1
            if row["acceptability"] == "Ja":
                yes_counts[theme] += 1
            if row["acceptability"] == "Nee":
                no_counts[theme] += 1

    return total_counts, yes_counts, no_counts


def theme_count_rows(rows):
    counts = answer_counts(rows)
    total_counts, yes_counts, no_counts = theme_counts(rows)
    table_rows = []

    for theme, label in THEME_LABELS.items():
        total = total_counts.get(theme, 0)
        table_rows.append([
            label,
            total,
            format_percent(total, counts["total"]),
            yes_counts.get(theme, 0),
            format_percent(yes_counts.get(theme, 0), counts["Ja"]),
            no_counts.get(theme, 0),
            format_percent(no_counts.get(theme, 0), counts["Nee"]),
        ])

    return sorted(table_rows, key=lambda row: (-row[1], row[0]))


def primary_theme_rows(rows):
    counts = answer_counts(rows)
    primary_counts = Counter(row["primary_theme"] for row in rows)

    return [
        [
            THEME_LABELS.get(theme, theme),
            count,
            format_percent(count, counts["total"]),
        ]
        for theme, count in primary_counts.most_common()
    ]


def combination_rows(rows):
    counts = Counter()
    for row in rows:
        labels = tuple(split_themes(row["themes"]))
        counts[labels] += 1

    return [
        [" + ".join(THEME_LABELS.get(theme, theme) for theme in themes), count]
        for themes, count in counts.most_common(15)
    ]


def review_rows(rows):
    review_counts = Counter()
    for row in rows:
        if row["needs_review"] == "true":
            for reason in split_themes(row["review_reason"]):
                review_counts[reason] += 1

    return [
        [reason, count]
        for reason, count in review_counts.most_common()
    ]


def codebook_rows():
    return [
        [theme, label]
        for theme, label in THEME_LABELS.items()
    ]


def validate_rows(rows):
    expected_ids = [
        *(f"J{index:03d}" for index in range(1, 100)),
        *(f"N{index:03d}" for index in range(1, 110)),
    ]
    actual_ids = [row["answer_id"] for row in rows]
    missing_ids = [answer_id for answer_id in expected_ids if answer_id not in actual_ids]

    if len(rows) != 208:
        raise SystemExit(f"Expected 208 coded rows, found {len(rows)}.")

    if missing_ids:
        raise SystemExit(f"Missing answer IDs: {', '.join(missing_ids)}")

    invalid_rows = [
        row["answer_id"]
        for row in rows
        if not row["primary_theme"] or not split_themes(row["themes"])
    ]
    if invalid_rows:
        raise SystemExit(f"Rows without primary theme or themes: {', '.join(invalid_rows)}")


def write_report(output_path, input_path, rows):
    validate_rows(rows)
    counts = answer_counts(rows)
    needs_review_count = sum(1 for row in rows if row["needs_review"] == "true")

    lines = [
        "# Thematische codering open antwoorden",
        "",
        f"Bron: `{input_path}`",
        "",
        "Dit rapport toont alleen geaggregeerde coderingen. Ruwe open antwoorden, e-mailadressen, respondent-id's en submission-id's zijn niet opgenomen.",
        "",
        "## Werkwijze",
        "- Multi-label codering: een antwoord kan meerdere thema's krijgen.",
        "- Elk antwoord heeft een primair thema.",
        "- De coded CSV bevat alleen antwoord-id's, bronrijen en codes; geen open tekst.",
        "- Antwoorden met lange, korte/onduidelijke of mogelijk herleidbare inhoud krijgen `needs_review=true`.",
        "",
        "## Samenvatting",
        f"- Gecodeerde antwoorden: {counts['total']}",
        f"- Ja-toelichtingen: {counts['Ja']}",
        f"- Nee/Andere reden-teksten: {counts['Nee']}",
        f"- Needs review: {needs_review_count}",
        "",
        "## Codeboek",
        markdown_table(["Code", "Label"], codebook_rows()),
        "",
        "## Thema-aantallen",
        markdown_table(
            ["Thema", "Totaal", "% totaal", "Ja", "% Ja", "Nee", "% Nee"],
            theme_count_rows(rows),
        ),
        "",
        "## Primaire thema's",
        markdown_table(
            ["Primair thema", "Aantal", "% totaal"],
            primary_theme_rows(rows),
        ),
        "",
        "## Top thema-combinaties",
        markdown_table(
            ["Combinatie", "Aantal"],
            combination_rows(rows),
        ),
        "",
        "## Review-redenen",
        markdown_table(
            ["Reden", "Aantal"],
            review_rows(rows),
        ),
        "",
    ]

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines), encoding="utf-8")


def main():
    args = parse_args()
    input_path = args.input.resolve()
    output_path = args.output.resolve()
    rows = read_rows(input_path)

    write_report(output_path, input_path, rows)
    counts = answer_counts(rows)
    print(f"Coded answers: {counts['total']}")
    print(f"Ja: {counts['Ja']}")
    print(f"Nee: {counts['Nee']}")
    print(f"Wrote: {output_path}")


if __name__ == "__main__":
    main()
