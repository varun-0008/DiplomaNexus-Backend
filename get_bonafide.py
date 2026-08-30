import sys
import requests
import json
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def get_bonafide_details(pin):
    url = "https://sbtet.telangana.gov.in/api/api/PreExamination/getBonafiedDetailsByPin"
    headers = {
        "Accept": "application/json, text/plain, */*",
        "token": "null",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
    }
    params = {"pin": pin}

    try:
        response = requests.get(url, headers=headers, params=params, verify=False, timeout=12)
        response.raise_for_status()
        data = response.json()
        if isinstance(data, str):
            data = json.loads(data)
        return data
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    pin_arg = sys.argv[1] if len(sys.argv) > 1 else "24054-cps-024"
    res = get_bonafide_details(pin_arg)
    print(json.dumps(res))
