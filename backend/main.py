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



@app.post("/meetings/{meeting_id}/join")
def join_meeting(
    meeting_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    user=Depends(get_current_user)
):
    supabase = get_user_supabase(credentials.credentials)

    # 참여하려는 모임이 존재하는지 확인
    response = (
        supabase.table("meetings")
        .select("id, creator_id, status, max_participants")
        .eq("id", meeting_id)
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=404,
            detail="존재하지 않는 모임입니다."
        )

    meeting = response.data[0]

    if meeting["status"] != "open":
        raise HTTPException(
            status_code=400,
            detail="현재 모집 중인 모임이 아닙니다."
        )

    # 이미 참여 기록이 있는지 확인
    participant_response = (
        supabase.table("meeting_participants")
        .select("id, status")
        .eq("meeting_id", meeting_id)
        .eq("user_id", str(user.id))
        .execute()
    )

    if participant_response.data:
        participant = participant_response.data[0]

        if participant["status"] == "joined":
            raise HTTPException(
                status_code=409,
                detail="이미 참여 중인 모임입니다."
            )


    # 현재 참여 중인 인원 확인
    members_response = (
        supabase.table("meeting_participants")
        .select("id")
        .eq("meeting_id", meeting_id)
        .eq("status", "joined")
        .execute()
    )

    current_count = len(members_response.data)

    # 정원이 가득 찼는지 확인
    if current_count >= meeting["max_participants"]:
        raise HTTPException(
            status_code=409,
            detail="모임 정원이 가득 찼습니다."
        )


    # 모임 참여 기록 저장
    if participant_response.data:
        # 이전에 탈퇴한 사용자라면 다시 참여
        result = (
            supabase.table("meeting_participants")
            .update({"status": "joined"})
            .eq("id", participant["id"])
            .eq("user_id", str(user.id))
            .execute()
        )
    else:
        # 처음 참여하는 사용자라면 새 기록 생성
        result = (
            supabase.table("meeting_participants")
            .insert({
                "meeting_id": meeting_id,
                "user_id": str(user.id),
                "status": "joined"
            })
            .execute()
        )

    return {
        "message": "모임 참여가 완료되었습니다.",
        "participant": result.data[0]
    }
