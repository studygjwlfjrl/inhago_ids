
from fastapi import FastAPI, HTTPException
from database import get_supabase

app = FastAPI(title="InhaGo API")


@app.get("/")
def home():
    return {
        "message": "InhaGo Backend API",
        "status": "ok"
    }


@app.get("/meetings")
def get_meetings():
    try:
        supabase = get_supabase()

        response = (
            supabase.table("meetings")
            .select(
                "id,title,description,category,"
                "location_name,latitude,longitude,"
                "meeting_time,max_participants,status"
            )
            .eq("status", "open")
            .gte("meeting_time", "now()")
            .order("meeting_time")
            .execute()
        )

        return {
            "meetings": response.data
        }

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="모임 목록을 불러오지 못했습니다."
        )
