import requests
import json

def verify_mobile_update(pin, phone, otp, auth_token):
    url = "https://sbtet.telangana.gov.in/api/api/PreExamination/UpdateUserdata"
    
    headers = {
        "Accept": "application/json, text/plain, */*",
        "token": auth_token,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
    }
    
    # Query parameters based on the captured request
    params = {
        "OTP": otp,
        "Pin": pin,
        "StudentPhoneNumber": phone
    }

    try:
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        
        # Parse the JSON response
        result = response.json()
        if isinstance(result, str):
            result = json.loads(result)
            
        return result
    except requests.exceptions.RequestException as e:
        return {"error": str(e)}

# Configuration
PIN = "24054-CPS-063"
PHONE = "9494836750"
OTP = "51B4F6"  # This changes every time a request is made
TOKEN = "YOUR_TOKEN_HERE"

# Execute
verification_result = verify_mobile_update(PIN, PHONE, OTP, TOKEN)
print(json.dumps(verification_result, indent=4))