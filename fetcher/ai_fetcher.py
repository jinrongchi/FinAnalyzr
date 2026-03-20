import json
import os

from openai import OpenAI

from utils.commons import (
    COMPANY_NAME,
    CURRENT_STOCK_PRICE,
    DCF_VALUE,
    FCF_YIELD,
    INDUSTRY,
    PB_RATIO,
    PE_RATIO,
    STOCK_CODE,
)


def fetch(stock_code: str):
    client = OpenAI(api_key=os.getenv("AI_API_KEY"), base_url=os.getenv("AI_BASE_URL"))

    system_prompt = f"""
        You are an assistant that returns a single JSON object only. 
        Do NOT include explanation text, markdown tags, or code fences.

        Input: A Chinese stock code (e.g. 605305).
        Example: Can you list the metrics for the stock 605305?
        Task:
        1. Fetch latest available market data for that stock.
        2. Return keys exactly as:
        "{STOCK_CODE}", "{COMPANY_NAME}", "{INDUSTRY}",
        "{CURRENT_STOCK_PRICE}", "{PB_RATIO}", "{PE_RATIO}",
        "{DCF_VALUE}", "{FCF_YIELD}".

        Output rules:
        - JSON object only.
        - Numeric fields are numbers (not strings).
        - Missing numeric values use null.
        - If any value is unavailable, set it to null (do not omit the key).
        - Use market data (not fabricated values).

        Example:
        {
            "{STOCK_CODE}": "605305",
            "{COMPANY_NAME}": "中际联合",
            "{INDUSTRY}": "风电",
            "{CURRENT_STOCK_PRICE}": 41.67,
            "{PB_RATIO}": 3.4,
            "{PE_RATIO}": 23.1,
            "{DCF_VALUE}": 12.1,
            "{FCF_YIELD}": 11.2
        }
        """

    user_prompt = f"Can you list the metrics for the stock {stock_code}?"

    ## TODO: If use AI, should it be able to fetch all the necessary data directly to skip the calculation
    ## Will the AI fetch the newest data through API?
    response = client.chat.completions.create(
        model=os.getenv("AI_MODEL"),
        messages=[
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": user_prompt,
            },
        ],
        stream=False,
        temperature=1.0,
        response_format={"type": "json_object"},
    )

    print(json.loads(response.choices[0].message.content))
