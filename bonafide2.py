import requests
import json

def generate_otp(pin, phone, auth_token):
    url = "https://sbtet.telangana.gov.in/api/api/PreExamination/GenerateOtpForMobileNoUpdate"
    
    headers = {
        "Accept": "application/json, text/plain, */*",
        "token": auth_token,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
    }
    
    # Query parameters
    params = {
        "Phone": phone,
        "Pin": pin
    }

    try:
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        
        # The response is a JSON string
        result = response.json()
        if isinstance(result, str):
            result = json.loads(result)
            
        return result
    except requests.exceptions.RequestException as e:
        return {"error": str(e)}

# Configuration
PIN = "24054-CPS-063"
PHONE = "9494836750"
TOKEN = "YOUR_TOKEN_HERE" # Must be the current session token

# Execute
status = generate_otp(PIN, PHONE, TOKEN)
print(status)