import logging
from datetime import datetime
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from database import get_supabase, get_user_supabase

app = FastAPI(title="InhaGo API")
security = HTTPBearer()
class MeetingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    description: str = ""
    category: str = Field(min_length=1)
    location_name: str = Field(min_length=1)
    latitude: float | None = None
    longitude: float | None = None
    meeting_time: datetime
    max_participants: int = Field(ge=2)
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    try:
        supabase = get_supabase()
        response = supabase.auth.get_user(credentials.credentials)

        if response.user is None:
            raise HTTPException(
                status_code=401,
                detail="유효하지 않은 로그인 토큰입니다."
            )

        return response.user

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="로그인 인증에 실패했습니다."
        )


@app.get("/")
def home():
    return {
        "message": "InhaGo Backend API",
        "status": "ok"
    }


@app.get("/meetings")
def get_meetings(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    user=Depends(get_current_user)
):
    try:
        supabase = get_user_supabase(credentials.credentials)
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
        
        logging.exception("모임 목록 조회 중 오류 발생")
        raise HTTPException(
            status_code=500,
            detail="모임 목록을 불러오지 못했습니다."
    )


@app.post("/meetings", status_code=201)
def create_meeting(
    meeting: MeetingCreate,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    user=Depends(get_current_user)
):
    try:
        supabase = get_user_supabase(credentials.credentials)

        data = meeting.model_dump(mode="json")
        data["creator_id"] = str(user.id)
        data["status"] = "open"

        response = (
            supabase.table("meetings")
            .insert(data)
            .execute()
        )

        return {"meeting": response.data[0]}

    except Exception:
        logging.exception("모임 생성 중 오류 발생")
        raise HTTPException(
            status_code=500,
            detail="모임을 생성하지 못했습니다."
        )
