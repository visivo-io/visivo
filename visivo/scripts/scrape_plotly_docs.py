"""Scrape Plotly docs JS v2.16.1 to get meta data about chart configs"""
import requests
from bs4 import BeautifulSoup
import re
from math import floor
import pandas as pd
from time import sleep
import random
import json


def get_plotly_docs_pages() -> list:
    base_url = "https://plotly.com"
    index_relative_url = "/javascript/reference/index/"
    landing_page_html_text = requests.get(base_url + index_relative_url).text
    landing_page_soup = BeautifulSoup(landing_page_html_text, "html.parser")
    side_bar_li_tags = landing_page_soup.find_all(
        "li", attrs={"class": "--sidebar-item"}
    )
    a_tags = []
    for li_tag in side_bar_li_tags:
        if li_tag.a:
            a_tags.append(li_tag.a)
    endpoints = list(set([a.get("href").split("#")[0] for a in a_tags]))
    return endpoints


def get_ul_from_plotly_url(relative_url):
    base_url = "https://plotly.com/"
    full_url = base_url + relative_url
    html_text = requests.get(full_url).text
    soup = BeautifulSoup(html_text, "html.parser")
    div_eight_columns = soup.find_all(name="div", attrs={"class": "eight columns"})
    ul = div_eight_columns[0].find(name="ul", recursive=False)
    return ul


def extract_data_from_li(tag, ul_handler=None):
    return_dict = {}

    if tag.ul is None:
        nested_ul_tag = {}
    elif callable(ul_handler):
        tag_ul = tag.ul.extract()
        nested_ul_tag = ul_handler(tag_ul)
    else:
        nested_ul_tag = tag.ul.extract()

    if tag.p is None:
        p_text = ""
    else:
        p_tag = tag.p.extract()
        p_text = p_tag.text

    split_html = re.split("<em>(.*?)<\/em>", tag.decode())
    li_items = [
        re.sub("<(.*?)>", "", s).strip().replace(":", "").lower() for s in split_html
    ]
    attribute = li_items.pop(0)
    for i in range(floor(len(li_items) / 2)):
        j = i * 2
        return_dict[li_items[j]] = li_items[j + 1]
    return_dict["attribute"] = attribute
    return_dict["description"] = p_text
    return_dict["children"] = nested_ul_tag
    return return_dict


def parseList(tag):
    if tag.name == "ul":
        return [parseList(item) for item in tag.find_all("li", recursive=False)]
    elif tag.name == "li":
        return extract_data_from_li(tag, parseList)


def flatten_parsed_configs(config_list):
    flattened_list = []
    for attribute_dict in config_list:
        try:
            child = attribute_dict.get("children")
        except:
            print(attribute_dict)
        flattened_list += [attribute_dict]
        if child:
            flattened_list += flatten_parsed_configs(child)
    return flattened_list


def get_all_plotly_config_metadata():
    endpoints = get_plotly_docs_pages()

    all_docs = []
    for endpoint in endpoints:
        ul = get_ul_from_plotly_url(endpoint)
        parsed = parseList(ul)
        flattened_parsed = flatten_parsed_configs(parsed)
        # random sleep so plotly doesnt get mad at all these connections
        sleep(random.uniform(0.1, 0.7))
        print(
            f"Extracted {len(flattened_parsed)} attributes for the endpoint: {endpoint}"
        )
        all_docs += flattened_parsed
    return all_docs


def clean_type(string: str):
    first_word = string.split(" ")[0]
    if first_word == "enumerated":
        return "enumerated"
    elif first_word == "flaglist":
        return "flaglist string"
    elif string[:1] == '"':
        return "type string"
    elif first_word == "object":
        return "object"
    else:
        return string


def og_parent(string: str):
    remove_children = string.split(".")[0]
    return remove_children.split("=")[-1].split("]")[0]


def direct_parent(string: str):
    try:
        return_string = string.split(".")[-1]
        return return_string
    except:
        return None


def augment_scraped_data(data: list):
    for d in range(len(data)):
        data[d]["og_parent"] = og_parent(data[d]["parent"])
        data[d]["clean_type"] = clean_type(data[d]["type"])
        data[d]["direct_parent"] = direct_parent(data[d]["parent"])
    return data


def write_to_src(data: list, file_name):
    with open(file_name, "w") as fp:
        json.dump(data, fp)


if __name__ == "__main__":
    print("Extracting Configs Meta Data from Plotly JS Docs..")
    data = get_all_plotly_config_metadata()
    data_aug = augment_scraped_data(data)
    file = "../src/plotly_config_meta.json"
    write_to_src(data_aug, file)
    print(f"Wrote file to {file}")
