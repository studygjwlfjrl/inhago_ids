
from fastapi import FastAPI

app = FastAPI(title="InhaGo API")

@app.get("/")
def home():
    return {
        "message": "InhaGo Backend API",
        "status": "ok"
    }
