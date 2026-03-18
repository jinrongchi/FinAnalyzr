import json
import re
from pathlib import Path
from typing import List

from utils.commons import COMPANY_NAME, INDUSTRY, REPORT_PERIOD, STOCK_CODE
from utils.stock_dataclass import FinancialData


def parse_json(file_path: Path) -> List[FinancialData]:
    """
    Parse a JSON file containing financial data and return a list of FinancialData objects.
    """
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return [FinancialData(**company) for company in data]
    except (json.JSONDecodeError, KeyError) as e:
        print(f"Error parsing JSON file {file_path}: {e}")
        return []


def parse_txt(file_path: Path) -> List[FinancialData]:
    """
    Parse a TXT file containing financial data and return a list of FinancialData objects.
    """
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        companies = re.split(r"\n\n+", content.strip())
        result = []
        for company_block in companies:
            data_dict = {}
            elements = company_block.strip().split("\n")
            for ele in elements:
                key, value_str = ele.split(": ", 1)
                key = key.strip()
                value_str = value_str.strip()
                if key in {COMPANY_NAME, INDUSTRY, REPORT_PERIOD, STOCK_CODE}:
                    data_dict[key] = value_str
                else:
                    try:
                        data_dict[key] = (
                            float(value_str) if value_str.lower() != "null" else None
                        )
                    except ValueError:
                        data_dict[key] = None
            result.append(FinancialData(**data_dict))
        return result
    except Exception as e:
        print(f"Error reading TXT file {file_path}: {e}")
        return []
