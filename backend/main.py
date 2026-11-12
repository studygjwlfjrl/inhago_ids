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


class MeetingUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    category: str | None = Field(default=None, min_length=1)
    location_name: str | None = Field(default=None, min_length=1)
    latitude: float | None = None
    longitude: float | None = None
    meeting_time: datetime | None = None
    max_participants: int | None = Field(default=None, ge=2)


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
    try:
        supabase = get_user_supabase(credentials.credentials)

        response = (
            supabase.rpc(
                "join_meeting_safe",
                {"p_meeting_id": meeting_id}
            )
            .execute()
        )

        if not response.data:
            raise HTTPException(
                status_code=500,
                detail="모임 참여 결과를 확인할 수 없습니다."
            )

        return {
            "message": "모임 참여가 완료되었습니다.",
            "participant": response.data
        }

    except HTTPException:
        raise
    except Exception:
        logging.exception("모임 참여 중 오류 발생")
        raise HTTPException(
            status_code=500,
            detail="모임 참여에 실패했습니다."
        )

@app.patch("/meetings/{meeting_id}")
def update_meeting(
    meeting_id: str,
    updates: MeetingUpdate,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    user=Depends(get_current_user)
):
    try:
        supabase = get_user_supabase(credentials.credentials)

        # 수정할 항목만 추출
        data = updates.model_dump(exclude_unset=True, mode="json")

        if not data:
            raise HTTPException(
                status_code=400,
                detail="수정할 내용을 입력해주세요."
            )

        

        # 모임장이면서 아직 열려 있는 모임만 수정 가능
        response = (
            supabase.table("meetings")
            .update(data)
            .eq("id", meeting_id)
            .eq("creator_id", str(user.id))
            .eq("status", "open")
            .select("*")
            .execute()
        )

        if not response.data:
            raise HTTPException(
                status_code=404,
                detail="수정 가능한 모임이 없거나 권한이 없습니다."
            )

        return {
            "message": "모임 수정이 완료되었습니다.",
            "meeting": response.data[0]
        }

    except HTTPException:
        raise
    except Exception:
        logging.exception("모임 수정 중 오류 발생")
        raise HTTPException(
            status_code=500,
            detail="모임 수정에 실패했습니다."
        )

@app.delete("/meetings/{meeting_id}/leave")
def leave_meeting(
    meeting_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    user=Depends(get_current_user)
):
    try:
        supabase = get_user_supabase(credentials.credentials)

        response = (
            supabase.table("meeting_participants")
            .delete()
            .eq("meeting_id", meeting_id)
            .eq("user_id", str(user.id))
            .select("id")
            .execute()
        )

        if not response.data:
            raise HTTPException(
                status_code=404,
                detail="참여 중인 모임을 찾을 수 없습니다."
            )

        return {"message": "모임 탈퇴가 완료되었습니다."}

    except HTTPException:
        raise
    except Exception:
        logging.exception("모임 탈퇴 중 오류 발생")
        raise HTTPException(
            status_code=500,
            detail="모임 탈퇴에 실패했습니다."
        )


@app.patch("/meetings/{meeting_id}/cancel")
def cancel_meeting(
    meeting_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    user=Depends(get_current_user)
):
    try:
        supabase = get_user_supabase(credentials.credentials)

        response = (
            supabase.table("meetings")
            .update({"status": "cancelled"})
            .eq("id", meeting_id)
            .eq("creator_id", str(user.id))
            .eq("status", "open")
            .select("id,title,status")
            .execute()
        )

        if not response.data:
            raise HTTPException(
                status_code=404,
                detail="취소할 수 있는 모임이 없거나 모임장이 아닙니다."
            )

        return {
            "message": "모임 취소가 완료되었습니다.",
            "meeting": response.data[0]
        }

    except HTTPException:
        raise
    except Exception:
        logging.exception("모임 취소 중 오류 발생")
        raise HTTPException(
            status_code=500,
            detail="모임 취소에 실패했습니다."
        )
