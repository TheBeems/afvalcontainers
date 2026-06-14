#!/usr/bin/env python3

import argparse
import csv
import json
import re
import statistics
from collections import Counter, defaultdict
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CLEANED = PROJECT_ROOT / "data/survey/processed/submissions_2026-06-14.cleaned.csv"
DEFAULT_THEMATIC = PROJECT_ROOT / "data/survey/processed/submissions_2026-06-14.thematic-coding.csv"
DEFAULT_QUALITY_REPORT = PROJECT_ROOT / "data/survey/processed/submissions_2026-06-14.quality-report.md"
DEFAULT_HOUSE_DETAILS_DIR = PROJECT_ROOT / "data/places/warmenhuizen/house-details"
DEFAULT_OUTPUT = PROJECT_ROOT / "data/places/warmenhuizen/survey-analysis-2026-06-14.json"

MIN_GROUP_SIZE = 5
SURVEY_DATE = "2026-06-14"
PLACE_ID = "warmenhuizen"
PLACE_NAME = "Warmenhuizen"

ACCEPTABILITY_FIELD = "Vind je de wijziging van restafval ophalen naar zelf wegbrengen acceptabel?"
ACCEPTABLE_REASON_FIELD = "Waarom vind je de wijziging acceptabel?"
NOT_ACCEPTABLE_REASON_FIELD = "Waarom vind je dit niet acceptabel?"
REASON_FLAG_PREFIX = "Waarom vind je dit niet acceptabel? ("

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

THEME_ORDER = list(THEME_LABELS)

DISALLOWED_KEY_RE = re.compile(
    r"(e-?mail|respondent|submission|submitted|timestamp|source_?line|cleaned_?row|"
    r"answer_?id|free_?text|open_?text|raw_?answer|extra_?fields)",
    re.IGNORECASE,
)
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?<!\d)(?:\+?31|0)[\s.-]?(?:\d[\s.-]?){8,10}(?!\d)")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate AVG-safe aggregate survey data for the public Warmenhuizen survey page."
    )
    parser.add_argument("--cleaned", type=Path, default=DEFAULT_CLEANED)
    parser.add_argument("--thematic", type=Path, default=DEFAULT_THEMATIC)
    parser.add_argument("--quality-report", type=Path, default=DEFAULT_QUALITY_REPORT)
    parser.add_argument("--house-details-dir", type=Path, default=DEFAULT_HOUSE_DETAILS_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def normalized(value):
    return "" if value is None else value.strip()


def read_csv(path, label):
    if not path.exists():
        raise SystemExit(f"{label} does not exist: {path}")

    with path.open(encoding="utf-8-sig", newline="") as csv_file:
        return list(csv.DictReader(csv_file))


def parse_quality_counts(path):
    if not path.exists():
        raise SystemExit(f"Quality report does not exist: {path}")

    counts = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"- ([A-Za-z ].*?): ([0-9]+)$", line)
        if match:
            key = match.group(1).lower().replace(" ", "_")
            counts[key] = int(match.group(2))

    return {
        "rawRecords": counts.get("raw_csv_records"),
        "quarantined": counts.get("quarantined_before_deduplication"),
        "duplicateGroups": counts.get("duplicate_groups"),
        "duplicateRecordsRemoved": counts.get("duplicate_records_removed"),
    }


def reason_flag_fields(rows):
    if not rows:
        return []

    return [
        field
        for field in rows[0]
        if field.startswith(REASON_FLAG_PREFIX)
    ]


def reason_label(field):
    return field.removeprefix(REASON_FLAG_PREFIX).removesuffix(")")


def split_themes(value):
    return [theme for theme in normalized(value).split("|") if theme]


def format_ratio(part, total):
    return 0 if total == 0 else round(part / total, 4)


def acceptability_counts(rows):
    counts = Counter(normalized(row.get(ACCEPTABILITY_FIELD)) for row in rows)
    total = counts.get("Ja", 0) + counts.get("Nee", 0)
    return {
        "total": total,
        "yes": counts.get("Ja", 0),
        "no": counts.get("Nee", 0),
        "yesRatio": format_ratio(counts.get("Ja", 0), total),
        "noRatio": format_ratio(counts.get("Nee", 0), total),
    }


def acceptability_summary(rows):
    counts = acceptability_counts(rows)
    return {
        **counts,
        "writtenYesResponses": sum(
            1
            for row in rows
            if normalized(row.get(ACCEPTABILITY_FIELD)) == "Ja"
            and normalized(row.get(ACCEPTABLE_REASON_FIELD))
        ),
        "writtenNoOtherResponses": sum(
            1
            for row in rows
            if normalized(row.get(ACCEPTABILITY_FIELD)) == "Nee"
            and normalized(row.get(NOT_ACCEPTABLE_REASON_FIELD))
        ),
    }


def acceptability_group(label, rows):
    counts = acceptability_counts(rows)
    return {
        "label": label,
        **counts,
    }


def coverage_band_rows(rows):
    by_status = defaultdict(list)
    for row in rows:
        by_status[normalized(row.get("coverage_status"))].append(row)

    ordered_statuses = [status for status in COVERAGE_STATUS_ORDER if status in by_status]
    ordered_statuses.extend(sorted(status for status in by_status if status not in COVERAGE_STATUS_ORDER))

    return [
        acceptability_group(COVERAGE_STATUS_LABELS.get(status, status), by_status[status])
        | {"status": status}
        for status in ordered_statuses
    ]


def reason_flag_rows(rows):
    no_rows = [
        row
        for row in rows
        if normalized(row.get(ACCEPTABILITY_FIELD)) == "Nee"
    ]
    no_total = len(no_rows)
    result = []

    for field in reason_flag_fields(rows):
        count = sum(1 for row in no_rows if normalized(row.get(field)) == "true")
        result.append({
            "label": reason_label(field),
            "count": count,
            "ratioOfNo": format_ratio(count, no_total),
        })

    return sorted(result, key=lambda row: (-row["count"], row["label"]))


def selected_reason_labels(row, fields):
    return [
        reason_label(field)
        for field in fields
        if normalized(row.get(field)) == "true"
    ]


def reason_pair_rows(rows):
    fields = reason_flag_fields(rows)
    counts = Counter()

    for row in rows:
        if normalized(row.get(ACCEPTABILITY_FIELD)) != "Nee":
            continue

        labels = selected_reason_labels(row, fields)
        for index, first_label in enumerate(labels):
            for second_label in labels[index + 1:]:
                counts[(first_label, second_label)] += 1

    return [
        {
            "label": f"{first_label} + {second_label}",
            "count": count,
        }
        for (first_label, second_label), count in counts.most_common(15)
    ]


def theme_rows(thematic_rows, field="themes"):
    total_counts = Counter()
    yes_counts = Counter()
    no_counts = Counter()
    answer_counts = Counter(row["acceptability"] for row in thematic_rows)
    total = len(thematic_rows)

    for row in thematic_rows:
        themes = split_themes(row[field]) if field == "themes" else [normalized(row.get(field))]
        for theme in themes:
            if not theme:
                continue
            total_counts[theme] += 1
            if row["acceptability"] == "Ja":
                yes_counts[theme] += 1
            if row["acceptability"] == "Nee":
                no_counts[theme] += 1

    return [
        {
            "code": theme,
            "label": THEME_LABELS.get(theme, theme),
            "total": total_counts.get(theme, 0),
            "totalRatio": format_ratio(total_counts.get(theme, 0), total),
            "yes": yes_counts.get(theme, 0),
            "yesRatio": format_ratio(yes_counts.get(theme, 0), answer_counts.get("Ja", 0)),
            "no": no_counts.get(theme, 0),
            "noRatio": format_ratio(no_counts.get(theme, 0), answer_counts.get("Nee", 0)),
        }
        for theme in THEME_ORDER
        if total_counts.get(theme, 0) > 0
    ]


def primary_theme_rows(thematic_rows):
    rows = theme_rows(thematic_rows, field="primary_theme")
    return sorted(rows, key=lambda row: (-row["total"], row["label"]))


def review_rows(thematic_rows):
    counts = Counter()
    for row in thematic_rows:
        if row["needs_review"] == "true":
            for reason in split_themes(row["review_reason"]):
                counts[reason] += 1
    return [{"label": label, "count": count} for label, count in counts.most_common()]


def load_coverage_rows(house_details_dir):
    coverage_rows = defaultdict(list)

    if not house_details_dir.exists():
        raise SystemExit(f"House details directory does not exist: {house_details_dir}")

    for path in sorted(house_details_dir.glob("*.json")):
        bundle = json.loads(path.read_text(encoding="utf-8"))
        street = bundle.get("street")
        for house in bundle.get("houses", []):
            distance = house.get("walkingDistance")
            if not isinstance(distance, (int, float)):
                continue

            coverage_rows[street].append({
                "distance": float(distance),
                "duration": house.get("walkingDuration"),
                "container": house.get("nearestContainerId") or "",
            })

    return coverage_rows


def coverage_stats(rows):
    distances = sorted(row["distance"] for row in rows)
    address_count = len(distances)
    over150 = sum(1 for distance in distances if distance >= 150)
    over275 = sum(1 for distance in distances if distance > 275)
    container_counts = Counter(row["container"] for row in rows if row["container"])
    return {
        "addressCount": address_count,
        "averageDistanceM": round(sum(distances) / address_count, 1),
        "medianDistanceM": round(statistics.median(distances), 1),
        "maxDistanceM": round(max(distances), 1),
        "over150Count": over150,
        "over150Ratio": format_ratio(over150, address_count),
        "over275Count": over275,
        "over275Ratio": format_ratio(over275, address_count),
        "mainContainerId": container_counts.most_common(1)[0][0] if container_counts else "",
    }


def street_rows(rows, coverage_by_street):
    grouped = defaultdict(list)
    for row in rows:
        grouped[normalized(row.get("street"))].append(row)

    visible = {
        street: street_records
        for street, street_records in grouped.items()
        if len(street_records) >= MIN_GROUP_SIZE
    }
    small_streets = sorted(street for street, street_records in grouped.items() if len(street_records) < MIN_GROUP_SIZE)
    small_rows = [row for street in small_streets for row in grouped[street]]

    result = []
    for street, street_records in visible.items():
        row = acceptability_group(street, street_records)
        if street in coverage_by_street:
            row["coverage"] = coverage_stats(coverage_by_street[street])
        result.append(row)

    result.sort(key=lambda row: (-row["no"], -row["total"], row["label"]))

    other_group = acceptability_group("Overige straten", small_rows)
    other_group["streetNames"] = small_streets
    other_group["streetCount"] = len(small_streets)

    return result, other_group


def container_rows(rows):
    grouped = defaultdict(list)
    for row in rows:
        grouped[normalized(row.get("container_id"))].append(row)

    visible = {
        container: container_records
        for container, container_records in grouped.items()
        if len(container_records) >= MIN_GROUP_SIZE
    }
    small_containers = sorted(
        container
        for container, container_records in grouped.items()
        if len(container_records) < MIN_GROUP_SIZE
    )
    small_rows = [row for container in small_containers for row in grouped[container]]

    result = [
        acceptability_group(container, container_records)
        for container, container_records in visible.items()
    ]
    result.sort(key=lambda row: (-row["no"], -row["total"], row["label"]))

    other_group = acceptability_group("Overige containers", small_rows)
    other_group["containerIds"] = small_containers
    other_group["containerCount"] = len(small_containers)

    return result, other_group


def distance_bottlenecks(street_group_rows):
    candidates = [
        row
        for row in street_group_rows
        if row.get("coverage")
        and row["noRatio"] >= 0.75
        and row["coverage"]["averageDistanceM"] >= 150
    ]

    return sorted(
        candidates,
        key=lambda row: (
            -row["coverage"]["over275Count"],
            -row["no"],
            -row["coverage"]["averageDistanceM"],
            row["label"],
        ),
    )[:12]


def blind_spots(coverage_by_street, survey_street_rows):
    survey_counts = Counter(normalized(row.get("street")) for row in survey_street_rows)
    candidates = []

    for street, rows in coverage_by_street.items():
        if len(rows) < MIN_GROUP_SIZE or survey_counts.get(street, 0) >= MIN_GROUP_SIZE:
            continue

        stats = coverage_stats(rows)
        if stats["averageDistanceM"] < 150:
            continue

        candidates.append({
            "label": street,
            "responseGroup": f"<{MIN_GROUP_SIZE} reacties",
            "coverage": stats,
        })

    return sorted(
        candidates,
        key=lambda row: (
            -row["coverage"]["averageDistanceM"],
            -row["coverage"]["over275Count"],
            row["label"],
        ),
    )[:12]


def validate_public_payload(value, path="$"):
    if isinstance(value, dict):
        for key, child in value.items():
            if DISALLOWED_KEY_RE.search(str(key)):
                raise SystemExit(f"Refusing to write disallowed key at {path}.{key}")
            validate_public_payload(child, f"{path}.{key}")
        return

    if isinstance(value, list):
        for index, child in enumerate(value):
            validate_public_payload(child, f"{path}[{index}]")
        return

    if isinstance(value, str):
        if EMAIL_RE.search(value) or PHONE_RE.search(value):
            raise SystemExit(f"Refusing to write possible contact detail at {path}")


def build_payload(args):
    cleaned_rows = read_csv(args.cleaned, "Cleaned survey CSV")
    thematic_rows = read_csv(args.thematic, "Thematic coding CSV")
    coverage_by_street = load_coverage_rows(args.house_details_dir)
    street_group_rows, other_street_group = street_rows(cleaned_rows, coverage_by_street)
    container_group_rows, other_container_group = container_rows(cleaned_rows)

    return {
        "schemaVersion": 1,
        "placeId": PLACE_ID,
        "placeName": PLACE_NAME,
        "surveyDate": SURVEY_DATE,
        "statusLabel": "Voorlopige analyse online en papieren inzendingen",
        "notes": [
            "Deze analyse gebruikt online en papieren inzendingen.",
            "Ruwe antwoorden en contactgegevens zijn niet opgenomen.",
            f"Straten en containers met minder dan {MIN_GROUP_SIZE} reacties zijn samengevoegd.",
        ],
        "privacy": {
            "minimumGroupSize": MIN_GROUP_SIZE,
            "streetGrouping": "Straten met minder dan 5 reacties worden samengevoegd onder Overige straten.",
            "containerGrouping": "Containers met minder dan 5 reacties worden samengevoegd onder Overige containers.",
            "publishedData": "Alleen geaggregeerde tellingen, percentages, thema's en dekkingstatistieken.",
        },
        "quality": parse_quality_counts(args.quality_report),
        "summary": acceptability_summary(cleaned_rows),
        "distanceBands": coverage_band_rows(cleaned_rows),
        "reasonFlags": reason_flag_rows(cleaned_rows),
        "reasonPairs": reason_pair_rows(cleaned_rows),
        "themes": sorted(theme_rows(thematic_rows), key=lambda row: (-row["total"], row["label"])),
        "primaryThemes": primary_theme_rows(thematic_rows),
        "reviewReasons": review_rows(thematic_rows),
        "streetGroups": street_group_rows,
        "otherStreetGroup": other_street_group,
        "containerGroups": container_group_rows,
        "otherContainerGroup": other_container_group,
        "distanceAndConcernBottlenecks": distance_bottlenecks(street_group_rows),
        "coverageBlindSpots": blind_spots(coverage_by_street, cleaned_rows),
    }


def main():
    args = parse_args()
    payload = build_payload(args)
    validate_public_payload(payload)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote: {args.output}")


if __name__ == "__main__":
    main()
