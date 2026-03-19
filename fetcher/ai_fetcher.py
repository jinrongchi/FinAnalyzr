import os
from openai import OpenAI

client = OpenAI(api_key=os.getenv("AI_API_KEY"), base_url=os.getenv("AI_BASE_URL"))


## TODO: If use AI, should it be able to fetch all the necessary data directly to skip the calculation
## Will the AI fetch the newest data through API?
response = client.chat.completions.create(
    model=os.getenv("AI_MODEL"),
    messages=[
        {
            "role": "system",
            "content": "You are a helpful assistant for financial data analysis.",
        },
        {
            "role": "user",
            "content": "What is the current stock price of Apple Inc. (AAPL)?",
        },
    ],
    stream=False,
    temperature=1.0,
    response_format="json_object",
)

print(response.choices[0].message.content)
