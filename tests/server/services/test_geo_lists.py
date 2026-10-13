from visivo.server.services.geo_lists import geo_kind_for


def test_state_names_and_codes():
    assert geo_kind_for(["New York", "California", "Texas"]) == "us_state"
    assert geo_kind_for(["NY", "ca", " TX "]) == "us_state"


def test_countries_in_each_spelling():
    assert geo_kind_for(["France", "Germany", "Japan"]) == "country_name"
    assert geo_kind_for(["FRA", "DEU", "JPN"]) == "iso3"
    assert geo_kind_for(["FR", "JP", "BR"]) == "iso2"


def test_two_letter_codes_read_as_states_before_countries():
    """CA, DE, GA, IN are both; a US-flavoured list wins the tie."""
    assert geo_kind_for(["CA", "DE", "GA", "IN"]) == "us_state"


def test_boroughs_are_a_custom_region():
    assert geo_kind_for(["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"]) == "custom"


def test_mostly_matching_is_enough_and_mostly_not_is_not():
    assert (
        geo_kind_for(["France", "Germany", "Japan", "Spain", "Italy", "Narnia"], min_share=0.8)
        == "country_name"
    )
    assert geo_kind_for(["France", "Narnia", "Mordor"]) is None


def test_too_few_values_or_blanks_say_nothing():
    assert geo_kind_for(["France"]) is None
    assert geo_kind_for([None, "", "  "]) is None
