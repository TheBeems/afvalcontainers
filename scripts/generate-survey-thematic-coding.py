#!/usr/bin/env python3

import argparse
import csv
import re
import unicodedata
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / "data/survey/processed/submissions_2026-05-28.cleaned.csv"
DEFAULT_OUTPUT = PROJECT_ROOT / "data/survey/processed/submissions_2026-05-28.thematic-coding.csv"

ACCEPTABILITY_FIELD = "Vind je de wijziging van restafval ophalen naar zelf wegbrengen acceptabel?"
ACCEPTABLE_REASON_FIELD = "Waarom vind je de wijziging acceptabel?"
NOT_ACCEPTABLE_REASON_FIELD = "Waarom vind je dit niet acceptabel?"

CODED_FIELDS = [
    "answer_id",
    "cleaned_row_number",
    "answer_group",
    "acceptability",
    "primary_theme",
    "themes",
    "needs_review",
    "review_reason",
]

THEMES = [
    "distance_or_accessibility",
    "elderly_disabled_health",
    "families_luiers_pets_heavy_waste",
    "litter_overflow_defects_maintenance",
    "hygiene_stench_pests_storage",
    "costs_fees_pay_per_bag",
    "service_loss_unnecessary_investment",
    "waste_separation_environment",
    "traffic_safety_car_use_parking",
    "location_street_scene_nature",
    "paper_container_vios_associations",
    "convenience_flexibility",
    "few_residual_waste_good_separation",
    "habit_acceptance_no_problem",
    "governance_participation_legal",
    "other_unclear",
]

THEME_KEYWORDS = {
    "distance_or_accessibility": [
        "afstand", "loopafstand", "lopen", "ver lopen", "dichtbij", "dicht bij",
        "bereiken", "bereikbaar", "wegbrengen", "sjouwen", "tillen",
        "oversteken", "gladheid", "slecht weer", "winter",
    ],
    "elderly_disabled_health": [
        "oudere", "ouderen", "bejaarden", "mindervalide", "minder validen",
        "slecht ter been", "mobiel", "mobiliteit", "gezondheid", "ziekte",
        "copd", "gehandicap", "incontinent", "medisch",
    ],
    "families_luiers_pets_heavy_waste": [
        "kind", "kinderen", "baby", "luiers", "luier", "peopluiers",
        "kat", "katten", "kattenbak", "kattengrind", "huisdier", "zware",
        "zwaar", "grote stukken", "groter afval", "kapotte emmer",
    ],
    "litter_overflow_defects_maintenance": [
        "zwerfafval", "afval naast", "naast de container", "bijplaats",
        "volle container", "container vol", "vol of defect", "defect",
        "klep", "weigert", "vuil naast", "grofvuil", "zakken naast",
        "niet op tijd geleegd", "leegfrequentie", "onderhoud", "kapot",
        "vandalisme", "vernieling",
    ],
    "hygiene_stench_pests_storage": [
        "stank", "stinken", "geur", "ongedierte", "rat", "ratten", "beestjes",
        "dieren", "vogels", "hygien", "vieze", "vies", "rotten", "rottend",
        "opslaan", "bewaren", "schuur", "tuin", "zak scheurt", "scheuren",
    ],
    "costs_fees_pay_per_bag": [
        "kosten", "kost", "betalen", "betaling", "per zak", "per keer",
        "per kg", "per kilo", "lediging", "storting", "tarief", "heffing",
        "aanslag", "belasting", "gemeentebelasting", "subsidie", "duurder",
        "goedkoper", "kostenbesparing", "bespaart",
    ],
    "service_loss_unnecessary_investment": [
        "service", "dienstverlening", "achteruitgang", "onnodig", "overbodig",
        "geldverspilling", "kapitaal vernietiging", "kapitaalvernietiging",
        "investering", "perfect werkend", "prima zo", "geen voordeel",
        "minder service", "veranderen", "systeem",
    ],
    "waste_separation_environment": [
        "scheiden", "afval scheiden", "restafval", "plastic", "milieu",
        "milieuvriendelijk", "co2", "uitstoot", "groene", "naschijding",
        "nascheiding", "verbranden", "afvalreductie", "bewuster",
        "minder grijs", "minder afval",
    ],
    "traffic_safety_car_use_parking": [
        "auto", "verkeer", "verkeers", "verkeersoverlast", "parkeren",
        "parkeerplaats", "veilig", "veiligheid", "gevaarlijk", "drukke weg",
        "kruising", "bushalte", "stoppen", "wegrijden", "vrachtverkeer",
    ],
    "location_street_scene_nature": [
        "straatbeeld", "uitzicht", "natuur", "park", "groen", "veldje",
        "plek", "plaatsing", "voor de deur", "bewoont", "bewoners",
        "openbare ruimte", "dorpssfeer", "locatie", "lelijk", "lelijke",
    ],
    "paper_container_vios_associations": [
        "papier", "papiercontainer", "papierbak", "oud papier", "vios",
        "vereniging", "verenigingen", "verenigingsleven", "blauwe bak",
        "dozen", "karton",
    ],
    "convenience_flexibility": [
        "wanneer", "elk moment", "op alle tijden", "tussendoor", "4 weken",
        "vier weken", "niet meer opletten", "bak buiten", "bak aan de weg",
        "uitkomst", "makkelijk", "handig", "prettig", "fijn", "chill",
        "geen probleem", "prima te doen",
    ],
    "few_residual_waste_good_separation": [
        "weinig afval", "weinig restafval", "bijna geen restafval",
        "grijze bak nooit vol", "niet zoveel", "klein huishouden",
        "scheid mijn afval goed", "goed afval scheiden", "minder vaak",
    ],
    "habit_acceptance_no_problem": [
        "gewend", "geen probleem", "maakt mij niet", "maakt me niet",
        "prima", "acceptabel", "dikke prima", "vooruitgang", "goed idee",
        "het moet", "geen bezwaar", "maakt niet uit",
    ],
    "governance_participation_legal": [
        "awb", "proportionaliteit", "gelijkheidsbeginsel", "participatie",
        "zorgvuldig", "gemeente moet", "besluit", "dorpsraad",
        "draagvlak", "consultatie", "publieke taak", "algemene wet",
    ],
}

POSITIVE_PRIMARY_PRIORITY = [
    "convenience_flexibility",
    "distance_or_accessibility",
    "few_residual_waste_good_separation",
    "waste_separation_environment",
    "costs_fees_pay_per_bag",
    "paper_container_vios_associations",
    "hygiene_stench_pests_storage",
    "habit_acceptance_no_problem",
    "litter_overflow_defects_maintenance",
    "elderly_disabled_health",
    "traffic_safety_car_use_parking",
    "location_street_scene_nature",
    "service_loss_unnecessary_investment",
    "families_luiers_pets_heavy_waste",
    "governance_participation_legal",
]

NEGATIVE_PRIMARY_PRIORITY = [
    "distance_or_accessibility",
    "litter_overflow_defects_maintenance",
    "costs_fees_pay_per_bag",
    "service_loss_unnecessary_investment",
    "elderly_disabled_health",
    "families_luiers_pets_heavy_waste",
    "hygiene_stench_pests_storage",
    "paper_container_vios_associations",
    "traffic_safety_car_use_parking",
    "waste_separation_environment",
    "location_street_scene_nature",
    "governance_participation_legal",
    "convenience_flexibility",
    "few_residual_waste_good_separation",
    "habit_acceptance_no_problem",
]

EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?<!\d)(?:\+?31|0)[\s.-]?(?:\d[\s.-]?){8,10}(?!\d)")
URL_RE = re.compile(r"https?://|www\.", re.IGNORECASE)
IDENTIFYING_DETAIL_RE = re.compile(
    r"\b[a-z]+(?:\s+[a-z]+){1,2},?\s+[a-z'. -]+(?:straat|laan|weg|pad|hof|akker|plein|ven)\s+\d+\b"
)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate local thematic coding for cleaned open survey answers."
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
        help=f"Coded CSV path. Default: {DEFAULT_OUTPUT}",
    )
    return parser.parse_args()


def normalized(value):
    return "" if value is None else value.strip()


def searchable_text(value):
    normalized_text = unicodedata.normalize("NFKD", value.lower())
    ascii_text = "".join(
        char
        for char in normalized_text
        if not unicodedata.combining(char)
    )
    return re.sub(r"\s+", " ", ascii_text)


def read_rows(input_path):
    if not input_path.exists():
        raise SystemExit(f"Cleaned CSV does not exist: {input_path}")

    with input_path.open(encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        fields = list(reader.fieldnames or [])
        rows = list(reader)

    required_fields = [
        ACCEPTABILITY_FIELD,
        ACCEPTABLE_REASON_FIELD,
        NOT_ACCEPTABLE_REASON_FIELD,
    ]
    missing_fields = [field for field in required_fields if field not in fields]
    if missing_fields:
        raise SystemExit(f"Cleaned CSV is missing required columns: {', '.join(missing_fields)}")

    return rows


def open_answers(rows):
    counters = {
        "Ja": 0,
        "Nee": 0,
    }

    for line_number, row in enumerate(rows, start=2):
        acceptability = normalized(row.get(ACCEPTABILITY_FIELD))

        if acceptability == "Ja":
            text = normalized(row.get(ACCEPTABLE_REASON_FIELD))
            if text:
                counters["Ja"] += 1
                yield counters["Ja"], line_number, "acceptable_reason", acceptability, text

        if acceptability == "Nee":
            text = normalized(row.get(NOT_ACCEPTABLE_REASON_FIELD))
            if text:
                counters["Nee"] += 1
                yield counters["Nee"], line_number, "not_acceptable_other", acceptability, text


def matched_themes(text):
    haystack = searchable_text(text)
    themes = []

    for theme in THEMES:
        if theme == "other_unclear":
            continue

        keywords = THEME_KEYWORDS[theme]
        if any(keyword in haystack for keyword in keywords):
            themes.append(theme)

    if not themes:
        themes.append("other_unclear")

    return themes


def primary_theme(themes, acceptability):
    priority = POSITIVE_PRIMARY_PRIORITY if acceptability == "Ja" else NEGATIVE_PRIMARY_PRIORITY
    for theme in priority:
        if theme in themes:
            return theme
    return themes[0]


def review_reasons(text, themes):
    reasons = []
    haystack = searchable_text(text)
    word_count = len(re.findall(r"\w+", text, flags=re.UNICODE))

    if len(text) > 800 or word_count > 140:
        reasons.append("long_answer")

    if EMAIL_RE.search(text) or PHONE_RE.search(text) or URL_RE.search(text):
        reasons.append("direct_contact_detail")

    if IDENTIFYING_DETAIL_RE.search(haystack):
        reasons.append("possible_identifying_detail")

    if themes == ["other_unclear"] or word_count <= 2:
        reasons.append("ambiguous_or_short")

    return reasons


def coded_row(sequence, cleaned_row_number, answer_group, acceptability, text):
    prefix = "J" if acceptability == "Ja" else "N"
    themes = matched_themes(text)
    reasons = review_reasons(text, themes)

    return {
        "answer_id": f"{prefix}{sequence:03d}",
        "cleaned_row_number": cleaned_row_number,
        "answer_group": answer_group,
        "acceptability": acceptability,
        "primary_theme": primary_theme(themes, acceptability),
        "themes": "|".join(themes),
        "needs_review": "true" if reasons else "false",
        "review_reason": "|".join(reasons),
    }


def write_coded_rows(output_path, coded_rows):
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("w", encoding="utf-8", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=CODED_FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(coded_rows)


def main():
    args = parse_args()
    input_path = args.input.resolve()
    output_path = args.output.resolve()
    rows = read_rows(input_path)
    coded_rows = [
        coded_row(sequence, line_number, answer_group, acceptability, text)
        for sequence, line_number, answer_group, acceptability, text in open_answers(rows)
    ]

    write_coded_rows(output_path, coded_rows)
    print(f"Coded answers: {len(coded_rows)}")
    print(f"Wrote: {output_path}")


if __name__ == "__main__":
    main()
