"""Formatters behind every value printed in the onboarding documents."""
from datetime import date

from app.modules.hr import doc_formatting as F


def test_formatters_ordinals_and_dates():
    assert [F.ordinal(n) for n in (1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31, 101, 111, 112)] == \
        ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "31st", "101st", "111th", "112th"]
    assert F.format_date(date(2026, 7, 6)) == "6 July 2026"
    assert F.format_date("2026-07-06", "MDY") == "July 6, 2026"
    assert F.format_date_legal(date(2026, 7, 6)) == "6th day of July, 2026"
    assert F.format_date_legal(date(2026, 8, 22)) == "22nd day of August, 2026"


def test_weekday_is_computed_from_the_date():
    assert F.format_date_long(date(2026, 8, 1)) == "Saturday, 1 August 2026"     # the reference documents said "Monday"
    assert F.format_date_long(date(2026, 8, 3), "MDY") == "Monday, August 3, 2026"
    assert F.weekday_code("2026-08-01") == "SAT"
    assert F.format_date_long(None) == "" and F.format_date("not a date") == ""


def test_money_grouping_and_symbols():
    assert F.format_money(12000, "INR") == "₹12,000"
    assert F.format_money(120000, "INR") == "₹1,20,000"
    assert F.format_money(15000000, "INR") == "₹1,50,00,000"
    assert F.format_money(12000.5, "INR") == "₹12,000.50"
    assert F.format_money(12000, "USD") == "$12,000.00"
    assert F.format_money(42000, "GBP") == "£42,000.00"
    assert F.format_money(120000, "INR", "international") == "₹120,000"
    assert F.format_money(5000, "CHF") == "CHF 5,000.00"
    assert F.format_money(None, "INR") == ""


def test_address_normalisation_and_india_layout():
    parts = {"house": "Flat-704, Block-B", "building": "Bhavyas Tulasi Vanam", "street": "ushamullapudi road.",
             "landmark": "Opp Yellammabanda Cheruvu", "locality": "Kukatpally", "city": "Hyderabad",
             "district": "Medchal-Malkajgiri", "state": "Telangana", "postal_code": "500072", "country": "IN"}
    assert F.address_lines(parts) == ["Flat-704, Block-B", "Bhavyas Tulasi Vanam", "Ushamullapudi Road", "Opp Yellammabanda Cheruvu",
                                      "Kukatpally", "Hyderabad", "District: Medchal-Malkajgiri, State: Telangana",
                                      "PIN Code: 500072"]
    assert F.normalise_address_part("II  stage, indiranagar.") == "II Stage, Indiranagar"
    assert F.format_address_inline({"address_line1": "1 Sample Street", "city": "Leeds", "postal_code": "LS1 1AA",
                                    "country": "GB"}) == "1 Sample Street, Leeds LS1 1AA, United Kingdom"
    assert "\n" in F.format_address_block(parts)


def test_names_initials_and_notice_text():
    assert F.initials("Ravuri Rugvedh") == "RR"
    assert F.initials("José-María Núñez") == "JMN"
    assert F.name_caps(" Ravuri  Rugvedh ") == "RAVURI RUGVEDH"
    assert F.name_title("RAVURI RUGVEDH") == "Ravuri Rugvedh"
    assert F.name_title("Mary McDonald") == "Mary McDonald"
    assert F.notice_text(15, "business_days") == "15 business days' written notice"
    assert F.notice_text(15, "calendar_days") == "15 days' written notice"
    assert F.notice_text(1, "months") == "1 month's written notice"
    assert F.notice_text(None, "weeks") == ""
    assert F.pluralise(1, "day") == "day" and F.pluralise(2, "day") == "days"
