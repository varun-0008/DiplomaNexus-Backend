import requests
import json

def get_full_consolidated_results(pin, auth_token):
    url = "https://sbtet.telangana.gov.in/api/api/Results/GetConsolidatedResults"
    
    headers = {
        "Accept": "application/json, text/plain, */*",
        "token": auth_token,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
    }
    
    params = {"Pin": pin}

    try:
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        
        # Step 1: Get the outer response
        outer_data = response.json()
        
        # Step 2: Parse the inner string into a real Python dictionary
        # This is the critical step you were missing
        full_data = json.loads(outer_data)
            
        return full_data
    except requests.exceptions.RequestException as e:
        print(f"Connection Error: {e}")
        return None
    except json.JSONDecodeError as e:
        print(f"Parsing Error: {e}")
        return None

# --- EXECUTION ---
PIN = "24054-cps-063"
TOKEN = "YOUR_TOKEN_HERE" # Replace with your actual token

data = get_full_consolidated_results(PIN, TOKEN)

if data:
    # Print Student Info
    student = data["Table"][0]
    stats = data["Table1"][0]
    print(f"STUDENT: {student['StudentName']} ({student['Pin']})")
    print(f"OVERALL CGPA: {stats['CGPA']}")
    print("-" * 50)
    print(f"{'SEM':<6} | {'CODE':<8} | {'GRADE':<5} | {'SUBJECT'}")
    print("-" * 50)
    
    # Print EVERY subject found in Table2
    for sub in data["Table2"]:
        print(f"{sub['Semester']:<6} | {sub['Subject_Code']:<8} | {sub['HybridGrade']:<5} | {sub['SubjectName']}")