import json
import re
from pathlib import Path

from utils.stock_dataclass import FinancialData


def parse_json(file_path: Path):
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    for company in data:
        fb = FinancialData()
        for key, value in company.items():
            setattr(fb, key, value)

        print(fb)


def parse_txt(file_path: Path):
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    companies = re.split(r"\n\n+", content.strip())
    for company in companies:
        print(type(company))
        print("---")

    # for block in blocks:
    #     if not block.strip():
    #         continue
    #     company = {}
    #     lines = block.strip().split('\n')
    #     for line in lines:
    #         if ':' not in line:
    #             continue
    #         key, value = line.split(':', 1)
    #         key = key.strip()
    #         value = value.strip()

    #         # Try to convert to number (int if no decimal, else float)
    #         try:
    #             # Handle potential thousand separators? Not present in your sample.
    #             if '.' in value:
    #                 company[key] = float(value)
    #             else:
    #                 # Try int first, fallback to float if too large (but Python int is unbounded)
    #                 company[key] = int(value)
    #         except ValueError:
    #             # Keep as string if not a number (e.g., company name, stock code)
    #             company[key] = value

    #     companies.append(company)

    # return companies
