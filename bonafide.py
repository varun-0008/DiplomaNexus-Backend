import requests
import json

def get_bonafide_details(pin, auth_token):
    url = "https://sbtet.telangana.gov.in/api/api/PreExamination/getBonafiedDetailsByPin"
    
    # Headers derived from the original request
    headers = {
        "Accept": "application/json, text/plain, */*",
        "token": auth_token,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
    }
    
    params = {"pin": pin}

    try:
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        
        # The API returns a JSON string inside a JSON response; double-load if necessary
        data = response.json()
        if isinstance(data, str):
            data = json.loads(data)
            
        return data
    except requests.exceptions.RequestException as e:
        return f"Error: {e}"

# Usage
PIN = "24054-cps-024"
TOKEN = "YOUR_TOKEN_HERE" # Replace with the <redacted> token from your DevTools

result = get_bonafide_details(PIN, TOKEN)
print(json.dumps(result, indent=4))